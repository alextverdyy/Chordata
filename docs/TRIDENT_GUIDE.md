# Monolith Trident gantry guide

[Open the hosted preview](https://alextverdyy.github.io/Chordata/?demo&guide&v=monolith-r0#guidePanel),
or expand **Interactive measurement guide** in Chordata.

![Monolith Trident gantry in the local Three.js viewer](images/trident-cad-viewer.png)

The model is the plain **Monolith R0 / v604 Trident 6 mm 2WD gantry**, with an
MGN12H X-rail configuration. It comes from the existing named assembly in Monolith's
showroom STEP. It is not the stock Voron Trident printer or the newer R1 gantry.
The CAD does not contain a toolhead, bed, full printer frame or sensor mount.

## Use the viewer

- Drag to orbit; scroll or pinch to zoom. With the canvas focused, arrow keys rotate,
  plus/minus zoom, and Home focuses the current step.
- **Whole gantry** shows the complete selected assembly. **Focus step** moves the
  camera to the relevant source geometry.
- **Isolate step parts** hides unrelated parts. **See through frame** makes the
  surrounding geometry transparent.
- Select a part to read its source CAD name.
- Select **Belt A** or **Belt B** to inspect the upper or lower source belt path.
  A/B are viewer labels. Use **Play illustration** or the slider to inspect slowed
  pluck motion; it is not measured belt motion.
- The sensor and quiet/tap steps provide written instructions and focus the X axis.
  They do not add an invented toolhead or sensor to the source gantry.
- Motion pauses when the guide is hidden. Reduced motion disables continuous playback;
  the slider remains available for the belt illustration. Written steps work if
  WebGL 2 is unavailable.

![Belt A step with its source belt highlighted](images/trident-pluck-guide.png)

## Measure the actual printer

Use the manufacturer's documented measurement span, toolhead position and target
for your build. The guide does not prescribe a universal span or target, move the
printer, or adjust tension. A frequency by itself does not establish force without
belt mass per length and span length.

The six steps cover the reference, sensor mount, quiet baseline and tap, belt A,
belt B, then comparison and a fresh A/B measurement after manual adjustment.
The live [sensor spectrum](MEASUREMENT_RELIABILITY.md#read-the-sensor-spectrum)
helps inspect the response; accepted counts and repeatability still determine
whether the measurement is complete.

For a local preview:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

Visit **http://127.0.0.1:8765/?demo&guide**. Readings are illustrative and printer
commands are disabled. The guide needs no AI service or external CDN.

## Source

Monolith Gantry by CloakedWayne and contributors, [R0 source CAD](https://github.com/Monolith3D/Monolith_Gantry/tree/0051697bd2b6c22d557c05ffe8e4b5e43c90490e/CAD),
licensed **CC BY-NC-SA 4.0**. See [conversion, configuration and licensing](TRIDENT_CAD.md)
for the exact source, checksums and part selection. This is an independent Chordata
viewer. No Behance artwork, mesh or animation was copied.
