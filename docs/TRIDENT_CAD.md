# Monolith Trident gantry CAD

The viewer uses the existing **Monolith R0 / v604, printed VT 6mm 2WD** gantry.
It is selected from the repository's showroom STEP, not reconstructed from separate
parts and not a full stock Voron printer.

- Source: [Monolith3D/Monolith_Gantry](https://github.com/Monolith3D/Monolith_Gantry/tree/0051697bd2b6c22d557c05ffe8e4b5e43c90490e).
- CAD: [CAD/Monolith_Gantry_v604.step](https://github.com/Monolith3D/Monolith_Gantry/blob/0051697bd2b6c22d557c05ffe8e4b5e43c90490e/CAD/Monolith_Gantry_v604.step).
- Pinned commit: `0051697bd2b6c22d557c05ffe8e4b5e43c90490e` (R0 tag).
- STEP size: 60,201,059 bytes.
- STEP SHA-256: `faab4005da2226e900297e4aa4ed0dab7faf9c259ddeaf20d9db1d5098e6c1ab`.
- Source assembly: `printed VT 6mm 2WD`.

The file contains eight separate showroom configurations. The converter selects
only the named Trident assembly. It uses the **MGN12H X rail configuration** and
omits the alternative `MGN9H specific` X-rail branch, including its carriage and
screws. Other MGN9H parts used on the Y axis remain. The gantry includes both source
belts, two rear drives, tensioners, rails, extrusions and hardware. No toolhead or
sensor is supplied by this CAD.

## Web asset

[web/monolith-gantry.glb](../web/monolith-gantry.glb) contains the converted geometry.
The [provenance manifest](../web/monolith-gantry.provenance.json) records the source,
asset checksum, each source part path, omitted alternative parts, bounds and mesh
settings. The asset contains 236 parts and 558,142 triangles, and is 9,238,092 bytes.
Its overall dimensions are 410 × 124 × 412.7 mm. Individual source part identities
and their relative positions are kept.
The conversion changes units and up-axis, then uniformly recenters the gantry.
It does not decimate the meshes or invent replacement mechanical parts.

Belt labels A and B are viewer labels: A is the upper source path and B the lower.
They are not claims about Monolith's official motor naming. Blue and amber highlights
are applied in the viewer. The slowed pluck line is an instructional overlay, not
measured motion or a physical tension simulation.

## Convert the source

Use a development computer with Python 3.11 or newer. The printer serves the
finished GLB; it needs no CAD packages.

```sh
python3 -m venv /tmp/monolith-cad-env
/tmp/monolith-cad-env/bin/pip install -r tools/requirements-cad.txt
/tmp/monolith-cad-env/bin/python tools/prepare_monolith.py
```

The tool downloads the pinned STEP if missing, verifies its checksum, selects the
named assembly, tessellates its geometry and exports a self-contained GLB. Import
can take several minutes. The importer selects the named source subtree before
constructing display parts, preserving their assembly locations and source names.

## Viewer build

The existing Moonraker companion serves the page, Three.js bundle and GLB together.
There is no CAD server, remote renderer or runtime CDN. The GLB loads when the guide
is opened and visible.

```sh
npm ci
npm run build:guide
```

`web/guide-source.js` imports Three.js, OrbitControls and GLTFLoader; esbuild produces
`web/guide.js`. CI rebuilds it and checks the committed output. The public preview
uses the same asset with demo readings and printer commands disabled.

## Attribution and license

Monolith Gantry is by **CloakedWayne and Monolith contributors**. The source and
derived display asset retain **CC BY-NC-SA 4.0**, separately from Chordata's code
license. The conversion selects one configuration, omits its alternate X-rail branch,
tessellates the geometry and recenters it. Preserve this attribution and license
when redistributing the model. The full [source license](licenses/monolith-CC-BY-NC-SA-4.0.txt)
is included. Three.js retains its [MIT license](licenses/three-MIT.txt).

Laya was consulted about selecting the existing complete assembly rather than
rebuilding R1 from modules. It ranked the existing assembly first but abstained
below the confidence threshold; source selection was checked independently.
