#!/usr/bin/env python3
"""Convert official Voron Trident STEP geometry to the guide's self-contained GLB.

Development tool only. See docs/TRIDENT_CAD.md for the isolated environment,
source license, deliberate detail reductions, and reproducible source revision.
"""
import argparse
import collections
import hashlib
import importlib.metadata
import json
import pathlib
import re
import urllib.request
import zipfile

import numpy as np
import trimesh
from build123d import import_step
from OCP.BRep import BRep_Tool
from OCP.TopAbs import TopAbs_Orientation
from OCP.TopLoc import TopLoc_Location

REVISION = "f04f747d4dea06315806f352abf57f767cedf2b4"
SOURCE = f"https://raw.githubusercontent.com/VoronDesign/Voron-Trident/{REVISION}/CAD/trident_assembly.step.zip"
ZIP_SHA256 = "9fe5a74f77048603e9289bdfcfa0db60b443252b9236ac3ef39821dc2a91209a"
STEP_SHA256 = "416eda4e9212b894ed6f78ad3a6af55757115ebfcc4c18db933743d97dd48ccf"
MEMBER = "trident_assembly.step"
ROOT = pathlib.Path(__file__).resolve().parents[1]
ROLES = ("belt_a", "belt_b", "tensioner_a", "tensioner_b", "drive_a", "drive_b",
         "toolhead", "gantry", "bed", "frame", "hardware")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_step(cache):
    cache.mkdir(parents=True, exist_ok=True)
    archive, step = cache / "trident-assembly.step.zip", cache / MEMBER
    if not archive.exists():
        print("Downloading pinned official STEP archive", flush=True)
        with urllib.request.urlopen(SOURCE, timeout=120) as response, archive.open("wb") as output:
            while block := response.read(1024 * 1024):
                output.write(block)
    if sha256(archive) != ZIP_SHA256:
        raise ValueError("Official STEP archive checksum differs from the pinned source")
    if not step.exists():
        # Read exactly the expected member; never extract arbitrary archive paths.
        with zipfile.ZipFile(archive) as zipped, zipped.open(MEMBER) as stream, step.open("wb") as output:
            while block := stream.read(1024 * 1024):
                output.write(block)
    if sha256(step) != STEP_SHA256:
        raise ValueError("Extracted STEP checksum differs from the pinned source")
    return step


def clean(label):
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def role_for(labels):
    labels = [clean(label) for label in labels]
    leaf = labels[-1]
    if leaf in ("a_belt", "b_belt"):
        return "belt_" + leaf[0]
    # Parent identity takes precedence over reused child part names in the CAD.
    for label in labels:
        for letter in ("a", "b"):
            if label == "front_idler_" + letter:
                return "tensioner_" + letter
            if label == letter + "_drive":
                return "drive_" + letter
    if "toolhead_assembly" in labels:
        return "toolhead"
    if "bed_components" in labels or "bed_extrusions" in labels:
        return "bed"
    if "gantry" in labels:
        return "gantry"
    if "frame" in labels:
        return "frame"
    return "hardware"


def leaf_shapes(shape, labels=(), inherited_color=None):
    labels = labels + (shape.label,)
    color = tuple(shape.color) if shape.color is not None else inherited_color
    if shape.children:
        for child in shape.children:
            yield from leaf_shapes(child, labels, color)
    else:
        yield shape, labels, color or (.35, .35, .35, 1.)


def parent_transform(shape):
    # Face triangulations include the leaf's own location; add only its ancestors.
    matrix = np.eye(4)
    if shape.parent is not None:
        transform = shape.parent.global_location.wrapped.Transformation()
        for row in range(3):
            for column in range(4):
                matrix[row, column] = transform.Value(row + 1, column + 1)
    return matrix


def mesh_leaf(shape, tolerance, angular_tolerance):
    # Some source faces are degenerate and have no triangulation. Preserve the
    # usable faces instead of making the entire 185 MB assembly unexportable.
    shape.mesh(tolerance, angular_tolerance)
    vertices, faces = [], []
    for face in shape.faces():
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(face.wrapped, location)
        if triangulation is None:
            continue
        offset = len(vertices)
        transform = location.Transformation()
        for i in range(1, triangulation.NbNodes() + 1):
            point = triangulation.Node(i).Transformed(transform)
            vertices.append((point.X(), point.Y(), point.Z()))
        reverse = face.wrapped.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
        for triangle in triangulation.Triangles():
            a, b, c = (triangle.Value(i) + offset - 1 for i in (1, 2, 3))
            faces.append((a, c, b) if reverse else (a, b, c))
    if not faces:
        return None
    vertices = np.asarray([tuple(vertex) for vertex in vertices], dtype=np.float64)
    transform = parent_transform(shape)
    vertices = vertices @ transform[:3, :3].T + transform[:3, 3]
    # STEP millimetres, Z up -> glTF metres, Y up, preserving handedness.
    vertices = vertices[:, [0, 2, 1]] * np.array([.001, .001, -.001])
    return trimesh.Trimesh(vertices=vertices, faces=np.asarray(faces), process=True)


def convert(model, output, tolerance, angular_tolerance, triangle_budget, cache=None):
    cache_data = cache / 'tessellation.npz' if cache else None
    cache_info = cache / 'tessellation.json' if cache else None
    expected = {"source_revision": REVISION, "linear_tolerance": tolerance,
                "angular_tolerance": angular_tolerance, "cache_version": 2}
    info = json.loads(cache_info.read_text()) if cache_info and cache_info.exists() else {}
    if cache_data and cache_data.exists() and info.get('settings') == expected:
        with np.load(cache_data, allow_pickle=False) as arrays:
            combined = {(key[0], int(key[1])): trimesh.Trimesh(
                vertices=arrays[f'v{i}'], faces=arrays[f'f{i}'], process=False)
                for i,key in enumerate(info['keys'])}
        palette = {int(key): tuple(value) for key,value in info['palette'].items()}
        paths = collections.defaultdict(list, info['paths'])
        omitted, total_leaves = info['omitted'], info['total_leaves']
        print('Using verified-source tessellation cache', flush=True)
    else:
        buckets = collections.defaultdict(list)
        paths = collections.defaultdict(list)
        omitted = collections.Counter()
        total_leaves = 0
        # Preserve dark, metal and red appearances using actual source representatives.
        palette_candidates = collections.defaultdict(list)
        for shape, labels, color in leaf_shapes(model):
            total_leaves += 1
            normalized = [clean(label) for label in labels]
            if any(label in ("panels", "electronics") for label in normalized):
                omitted["enclosure_panels_and_electronics"] += 1
                continue
            leaf = normalized[-1]
            role = role_for(labels)
            # Mechanical belt routing, drives, idlers and toolhead are retained. Omit
            # ordinary fasteners, whose detailed heads/threads dominate mobile budgets.
            fastener = re.match(r"m[23568](x|_|\d)", leaf) or any(word in leaf for word in ("heat_set", "tnut", "t_nut", "washer", "screw"))
            if any(word in leaf for word in ("leadscrew", "lead_screw", "ballscrew", "ball_screw")):
                fastener = False
            if fastener and not role.startswith("tensioner_"):
                omitted["ordinary_fasteners"] += 1
                continue
            mesh = mesh_leaf(shape, tolerance, angular_tolerance)
            if mesh is None:
                omitted["empty_shape"] += 1
                continue
            rgb = np.array(color[:3])
            # Red source accents must remain red; achromatic tones split by value.
            slot = 2 if rgb[0] > 1.4 * max(rgb[1], rgb[2], .01) else int(float(rgb.mean()) >= .32)
            palette_candidates[slot].append((len(mesh.faces), tuple(color)))
            buckets[role, slot].append(mesh)
            paths[role].append("/".join(labels))
            if total_leaves % 100 == 0:
                print(f"Tessellated {total_leaves} source components", flush=True)
        palette = {}
        for slot, candidates in palette_candidates.items():
            color_weights = collections.Counter()
            for weight, color in candidates:
                color_weights[color] += weight
            palette[slot] = max(color_weights, key=color_weights.get)
        combined = {key: trimesh.util.concatenate(meshes) for key, meshes in buckets.items()}
        if cache_data:
            arrays = {}
            for i,mesh in enumerate(combined.values()):
                arrays[f'v{i}'], arrays[f'f{i}'] = mesh.vertices, mesh.faces
            np.savez_compressed(cache_data, **arrays)
            cache_info.write_text(json.dumps({"settings": expected, "keys": list(combined),
                "palette": palette, "paths": paths, "omitted": dict(omitted),
                "total_leaves": total_leaves}))
    original_triangles = sum(len(mesh.faces) for mesh in combined.values())
    # Allocate detail roughly by square root of source complexity so tiny threaded
    # or curved parts cannot consume the whole budget; keep belt geometry intact.
    fixed_triangles = sum(len(mesh.faces) for key, mesh in combined.items() if key[0].startswith("belt_"))
    weights = {key: (0. if key[0].startswith("belt_") else math_weight(mesh, key[0]))
               for key, mesh in combined.items()}
    total_weight = sum(weights.values())
    remaining_budget = max(triangle_budget - fixed_triangles, 100 * len(combined))
    scene = trimesh.Scene()
    group_metadata = {}
    for role in ROLES:
        scene.graph.update(frame_to=role, frame_from=scene.graph.base_frame, matrix=np.eye(4),
                           metadata={"role": role})
        for key, mesh in combined.items():
            if key[0] != role:
                continue
            requested = max(100, int(remaining_budget * weights[key] / total_weight))
            if len(mesh.faces) > requested and not role.startswith("belt_"):
                mesh = mesh.simplify_quadric_decimation(face_count=requested, aggression=5)
            mesh.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
                name=f"source_material_{key[1]}", baseColorFactor=palette[key[1]],
                metallicFactor=.6 if key[1] == 1 else .05, roughnessFactor=.57))
            mesh.metadata.update(role=role, source="VoronDesign/Voron-Trident")
            name = f"{role}__material_{key[1]}"
            scene.add_geometry(mesh, node_name=name, geom_name=name, parent_node_name=role)
        if paths[role]:
            role_meshes = [scene.geometry[name] for name in scene.geometry if name.startswith(role + "__")]
            bounds = trimesh.util.concatenate(role_meshes).bounds
            group_metadata[role] = {"source_components": len(paths[role]),
                                    "source_paths": paths[role], "bounds_m": bounds.tolist(),
                                    "center_m": bounds.mean(axis=0).tolist()}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(trimesh.exchange.gltf.export_glb(scene, include_normals=True))
    triangles = sum(len(mesh.faces) for mesh in scene.geometry.values())
    metadata = {"source_repository": "https://github.com/VoronDesign/Voron-Trident",
                "source_revision": REVISION, "source_url": SOURCE,
                "source_zip_sha256": ZIP_SHA256, "source_step_sha256": STEP_SHA256,
                "source_zip_member": MEMBER, "license": "GPL-3.0",
                "license_url": f"https://github.com/VoronDesign/Voron-Trident/blob/{REVISION}/LICENSE",
                "asset": output.name, "asset_sha256": sha256(output), "asset_bytes": output.stat().st_size,
                "units": "metres", "up_axis": "Y", "source_units": "millimetres", "source_up_axis": "Z",
                "source_to_asset": {"x": "source_x / 1000", "y": "source_z / 1000", "z": "-source_y / 1000"},
                "bounds_m": scene.bounds.tolist(), "triangles": triangles,
                "meshes": len(scene.geometry), "source_leaf_components": total_leaves,
                "triangles_before_simplification": original_triangles,
                "omitted_components": dict(omitted), "groups": group_metadata,
                "conversion": {"linear_tolerance_mm": tolerance, "angular_tolerance_radians": angular_tolerance,
                               "triangle_budget": triangle_budget, "simplification_aggression": 5,
                               "materials": {str(k): list(v) for k, v in palette.items()},
                               "tools": {name: importlib.metadata.version(name) for name in ("build123d", "trimesh", "fast-simplification")}},
                "limitations": ["Instructional display mesh, not fabrication CAD or a calibrated printer model",
                                "Panels, electronics and ordinary fasteners omitted; remaining geometry decimated",
                                "Source material colors clustered to three original CAD representatives",
                                "A/B names follow upstream CAD and may differ from a printer's labels"]}
    output.with_suffix(".provenance.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({key: metadata[key] for key in ("asset_bytes", "triangles", "meshes", "bounds_m")}, indent=2), flush=True)


def math_weight(mesh, role):
    return float(len(mesh.faces)) ** .5 * (1.5 if role in ("toolhead", "tensioner_a", "tensioner_b") else 1.)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=pathlib.Path, default=pathlib.Path("/tmp/chordata-trident"))
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "web/trident.glb")
    parser.add_argument("--linear-tolerance", type=float, default=.35)
    parser.add_argument("--angular-tolerance", type=float, default=.35)
    parser.add_argument("--triangles", type=int, default=220000)
    args = parser.parse_args()
    step = source_step(args.cache_dir)
    print("Importing official STEP assembly (can take several minutes)", flush=True)
    info = args.cache_dir / 'tessellation.json'
    settings = {"source_revision": REVISION, "linear_tolerance": args.linear_tolerance,
                "angular_tolerance": args.angular_tolerance, "cache_version": 2}
    cached = (args.cache_dir / 'tessellation.npz').exists() and info.exists() and json.loads(info.read_text()).get('settings') == settings
    model = None if cached else import_step(step)
    print("Preparing actual source geometry", flush=True)
    convert(model, args.output, args.linear_tolerance, args.angular_tolerance, args.triangles, args.cache_dir)


if __name__ == "__main__":
    main()
