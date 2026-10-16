# Official CAD asset and local viewer

The tutorial uses the actual Voron Trident assembly from
[VoronDesign/Voron-Trident](https://github.com/VoronDesign/Voron-Trident), pinned to
commit `f04f747d4dea06315806f352abf57f767cedf2b4`.
The [source STEP archive](https://github.com/VoronDesign/Voron-Trident/blob/f04f747d4dea06315806f352abf57f767cedf2b4/CAD/trident_assembly.step.zip)
is 30,121,750 bytes. Its SHA-256 is
`9fe5a74f77048603e9289bdfcfa0db60b443252b9236ac3ef39821dc2a91209a`;
the extracted STEP SHA-256 is
`416eda4e9212b894ed6f78ad3a6af55757115ebfcc4c18db933743d97dd48ccf`.

The browser asset is [web/trident.glb](../web/trident.glb).
Its [provenance manifest](../web/trident.provenance.json) records the export checksum,
bounds, triangle count, grouped source components and conversion settings.
The source archive was independently matched against GitHub's pinned blob ID.
The shipped model contains 373,377 triangles in 27 mesh groups and is 8,799,064
bytes (8.39 MiB). Its belt meshes retain the source tessellation. Other groups
are simplified; the requested triangle count is a target, not a hard bound on
the decimator's output.

## Conversion

Run conversion with Python 3.11 or newer on a development computer, not the printer
host. It needs substantial
RAM and takes several minutes to import the 185 MB STEP assembly. The printer only
serves the finished browser asset.

```sh
python3 -m venv /tmp/trident-cad-env
/tmp/trident-cad-env/bin/pip install -r tools/requirements-cad.txt
/tmp/trident-cad-env/bin/python tools/prepare_trident.py
```

The script downloads and verifies the pinned archive, verifies the exact STEP member,
and tessellates its source geometry. It preserves nested assembly transforms and
converts millimetres/Z-up to metres/Y-up. It omits enclosure panels, electronics
and ordinary fasteners to expose the motion system and reduce loading/rendering
cost. Lead screws and tensioner geometry remain. Other meshes are simplified to a
triangle budget; belt geometry is preserved. Source material colors are clustered
to three source-color representatives.
Faces without a usable CAD triangulation are skipped. A local tessellation cache
avoids repeating the large STEP import when adjusting the display export; delete
the cache to repeat conversion from the verified STEP file.

The export merges geometry by semantic role and material to reduce draw calls.
Selection therefore identifies **CAD mesh groups**, not individual original screws
or printable parts. The manifest lists original component paths for each group.
This is an optimized visual mesh, not fabrication CAD or a dimensional inspection tool.

## Three.js build

The existing Moonraker page remains one application. It serves the spectrum code,
bundled Three.js guide and model from fixed local routes. There is no CAD server,
remote renderer or runtime CDN dependency. The model loads only when the guide
is open and visible.

```sh
npm ci
npm run build:guide
```

`web/guide-source.js` imports Three.js, OrbitControls and GLTFLoader. esbuild bundles
them into `web/guide.js`. CI rebuilds the bundle and checks that it matches the
committed output before running the browser tests. Rebuild after editing the source;
do not edit the generated bundle by hand.

The native Laya architecture comparison ranked the single-application option first
but abstained at low confidence. The implementation follows the user's preference
and the existing deployment model; this was not treated as model approval.

## License and instructional overlays

The source Voron design and derived model are distributed under GPL-3.0; the exact
upstream source revision and its license remain linked in the manifest and viewer.
The conversion code is included so the display mesh can be regenerated from source.
Three.js uses the [MIT license](licenses/three-MIT.txt), preserved in the bundle
and provided in full here. Chordata remains GPL-3.0-or-later.

The green accelerometer board/screws and slowed belt-wave animation are instructional
overlays. They are not represented as source CAD parts or a measured physical
simulation. Actual mounts and the documented measurement span can differ by build.
The guide sends no printer commands and does not choose a universal tension target.
