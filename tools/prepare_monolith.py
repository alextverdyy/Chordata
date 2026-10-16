#!/usr/bin/env python3
"""Convert the existing Monolith R0 Trident 6 mm 2WD gantry from STEP to GLB."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import urllib.request

import numpy as np
import trimesh
from build123d import Compound, Location, Shape
from OCP.BRep import BRep_Tool
from OCP.TopAbs import TopAbs_Orientation
from OCP.TopLoc import TopLoc_Location
from OCP.Quantity import Quantity_ColorRGBA
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.collections import Sequence_TDF_Label
from OCP.TDF import TDF_Label
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_ColorGen, XCAFDoc_ColorSurf, XCAFDoc_ColorTool, XCAFDoc_DocumentTool

ROOT = Path(__file__).resolve().parents[1]
REVISION = "0051697bd2b6c22d557c05ffe8e4b5e43c90490e"
SOURCE_PATH = "CAD/Monolith_Gantry_v604.step"
SOURCE = f"https://raw.githubusercontent.com/Monolith3D/Monolith_Gantry/{REVISION}/{SOURCE_PATH}"
STEP_SHA256 = "faab4005da2226e900297e4aa4ed0dab7faf9c259ddeaf20d9db1d5098e6c1ab"
ASSEMBLY = "printed VT 6mm 2WD"

def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


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
    # usable faces instead of making the source assembly unexportable.
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


def load_selected(step):
    """Read source XDE labels before constructing only the requested gantry.

    Avoid color/bounding-box walks over all eight unrelated showroom assemblies.
    OCCT supplies body components for products containing both geometry and parts.
    """
    doc = TDocStd_Document(TCollection_ExtendedString("XCAF"))
    tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    colors = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    reader.SetColorMode(True)
    reader.SetLayerMode(False)
    reader.ReadFile(str(step))
    reader.Transfer(doc)
    print("STEP transfer complete; selecting source gantry", flush=True)

    def name(label):
        value = TDataStd_Name()
        return TCollection_AsciiString(value.Get()).ToCString() if label.FindAttribute(TDataStd_Name.GetID_s(), value) else "unnamed"

    def referred(label):
        if tool.IsReference_s(label):
            target = TDF_Label()
            tool.GetReferredShape_s(label, target)
            return target
        return label

    def children(label):
        sequence = Sequence_TDF_Label()
        tool.GetComponents_s(label, sequence)
        return [sequence.Value(i) for i in range(1, sequence.Length() + 1)]

    found = []
    def find(label, ancestors):
        target = referred(label)
        world = ancestors * Location(tool.GetLocation_s(label))
        if name(target) == ASSEMBLY:
            found.append((label, world))
        for child in children(target):
            find(child, world)

    roots = Sequence_TDF_Label()
    tool.GetFreeShapes(roots)
    for i in range(1, roots.Length() + 1):
        find(roots.Value(i), Location())
    if len(found) != 1:
        raise ValueError(f"Expected exactly one {ASSEMBLY!r} assembly; got {len(found)}")

    def build(label):
        target = referred(label)
        components = children(target)
        if components:
            shape = Compound(children=[build(child) for child in components])
        else:
            shape = Shape.cast(tool.GetShape_s(target))
        shape.label = name(target)
        color = Quantity_ColorRGBA()
        for candidate in (label, target):
            if (XCAFDoc_ColorTool.GetColor_s(candidate, XCAFDoc_ColorGen, color)
                    or XCAFDoc_ColorTool.GetColor_s(candidate, XCAFDoc_ColorSurf, color)):
                rgb = color.GetRGB()
                shape.color = (rgb.Red(), rgb.Green(), rgb.Blue(), color.Alpha())
                break
        if shape.color is None and not components:
            # Source face color fallback: use the first defined surface color.
            for face in shape.faces():
                if colors.GetColor(face.wrapped, XCAFDoc_ColorSurf, color):
                    rgb = color.GetRGB()
                    shape.color = (rgb.Red(), rgb.Green(), rgb.Blue(), color.Alpha())
                    break
        shape.move(Location(tool.GetLocation_s(label)))
        return shape

    selected = build(found[0][0])
    selected.location = found[0][1]
    return selected


def convert(step, output):
    if sha256(step) != STEP_SHA256:
        raise ValueError("STEP checksum does not match the pinned Monolith source")
    print("Importing the repository's Monolith showroom STEP", flush=True)
    selected = load_selected(step)
    print(f"Selected exact source assembly: {selected.label}", flush=True)
    parts, omitted = [], []
    leaves = list(leaf_shapes(selected))
    step.with_suffix(".parts.json").write_text(json.dumps([dict(path="/".join(labels), faces=len(shape.faces())) for shape, labels, _ in leaves], indent=2))
    print(f"Imported {len(leaves)} source geometry parts", flush=True)
    for shape, labels, color in leaves:
        if any(label.lower().replace("_", " ").startswith("mgn9h specific") for label in labels):
            omitted.append("/".join(labels))
            continue
        mesh = mesh_leaf(shape, .25, .3)
        if mesh is None:
            raise ValueError("No triangulated geometry for " + "/".join(labels))
        text = " ".join(labels).lower().replace("_", " ")
        if "belt" in text and "clamp" not in text:
            role = "belt"
        elif "tensioner" in text:
            role = "tensioner"
        elif "motor" in text or "nema" in text:
            role = "drive"
        elif "xy joint" in text:
            role = "xy_joint"
        elif "x extrusion" in text:
            role = "x_axis"
        elif "extrusion" in text:
            role = "frame"
        else:
            role = "hardware"
        parts.append(dict(mesh=mesh, labels=labels, color=color, role=role))
    # The showroom positions configurations apart; recenter this one assembly
    # uniformly. Preserve every part's position relative to every other part.
    source_bounds = trimesh.util.concatenate([p["mesh"] for p in parts]).bounds
    center = source_bounds.mean(axis=0)
    belt_parts = sorted([p for p in parts if p["role"] == "belt"],
                        key=lambda p: float(p["mesh"].bounds.mean(axis=0)[1]), reverse=True)
    if len(belt_parts) != 2:
        raise ValueError(f"Expected two source belt paths, got {len(belt_parts)}")
    for part, role in zip(belt_parts, ("belt_a", "belt_b")):
        part["role"] = role
    scene = trimesh.Scene()
    manifest_parts = []
    for index, part in enumerate(parts):
        mesh, role, labels, color = (part[k] for k in ("mesh", "role", "labels", "color"))
        mesh.apply_translation(-center)
        mesh.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=color, metallicFactor=.1, roughnessFactor=.6))
        mesh.metadata.update(role=role, source_part=labels[-1], source_path="/".join(labels))
        name = f"{index:03d}_{labels[-1]}"
        scene.add_geometry(mesh, node_name=name, geom_name=name)
        manifest_parts.append(dict(name=name, role=role, source_path="/".join(labels),
                                   triangles=len(mesh.faces), bounds_m=mesh.bounds.tolist()))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(trimesh.exchange.gltf.export_glb(scene, include_normals=True))
    metadata = dict(source_repository="https://github.com/Monolith3D/Monolith_Gantry",
        source_revision=REVISION, source_path=SOURCE_PATH, source_url=SOURCE,
        source_step_sha256=STEP_SHA256, source_step_bytes=step.stat().st_size,
        source_assembly=ASSEMBLY, source_release="R0 / v604",
        license="CC-BY-NC-SA-4.0", license_url="https://creativecommons.org/licenses/by-nc-sa/4.0/",
        attribution="Monolith Gantry by CloakedWayne and Monolith contributors",
        asset=output.name, asset_sha256=sha256(output), asset_bytes=output.stat().st_size,
        units="metres", up_axis="Y", source_units="millimetres", source_up_axis="Z",
        source_to_asset=dict(axis_mapping="[x, z, -y] / 1000", recenter_translation_m=(-center).tolist()),
        source_bounds_m=source_bounds.tolist(), bounds_m=scene.bounds.tolist(),
        triangles=sum(len(p["mesh"].faces) for p in parts), meshes=len(parts), parts=manifest_parts,
        source_geometry_parts=len(leaves), omitted_parts=omitted, decimation=False,
        rail_configuration="MGN12H; alternate MGN9H-specific X rail branch omitted",
        belt_labels="A is the upper source belt path; B is the lower. Viewer labels, not source part names.",
        conversion=dict(linear_tolerance_mm=.25, angular_tolerance_radians=.3,
            tools={name: importlib.metadata.version(name) for name in ("build123d", "trimesh")}),
        limitations=["Existing legacy R0 Trident 6mm 2WD gantry, not R1 or a full printer",
                     "No toolhead or sensor is present in this source assembly",
                     "Only the alternate MGN9H-specific X rail branch is omitted",
                     "Tessellated display mesh, not fabrication CAD or a tension simulation"])
    output.with_suffix(".provenance.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({key: metadata[key] for key in ("asset_bytes", "triangles", "meshes", "bounds_m")}, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step", type=Path, default=Path("/tmp/monolith-gantry.step"))
    parser.add_argument("--output", type=Path, default=ROOT / "web/monolith-gantry.glb")
    args = parser.parse_args()
    if not args.step.exists():
        args.step.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(SOURCE, timeout=120) as response, args.step.open("wb") as stream:
            while block := response.read(1024 * 1024):
                stream.write(block)
    convert(args.step, args.output)
