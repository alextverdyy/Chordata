"""Check the shipped display asset without requiring a CAD toolchain on CI/printer."""
import hashlib
import json
from pathlib import Path
import struct
import unittest

ROOT=Path(__file__).resolve().parents[1]

class CadAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw=(ROOT/'web/monolith-gantry.glb').read_bytes()
        cls.provenance=json.loads((ROOT/'web/monolith-gantry.provenance.json').read_text())
        magic,version,length=struct.unpack_from('<4sII',cls.raw)
        if (magic,version,length)!=(b'glTF',2,len(cls.raw)):
            raise AssertionError('Invalid GLB header')
        chunk_length,chunk_type=struct.unpack_from('<I4s',cls.raw,12)
        if chunk_type!=b'JSON':raise AssertionError('Missing GLB JSON chunk')
        cls.gltf=json.loads(cls.raw[20:20+chunk_length])

    def test_asset_is_bounded_actual_triangle_geometry(self):
        triangles=0
        for mesh in self.gltf['meshes']:
            for primitive in mesh['primitives']:
                self.assertEqual(primitive.get('mode',4),4)
                triangles+=self.gltf['accessors'][primitive['indices']]['count']//3
        self.assertGreater(triangles,10000)
        self.assertLess(triangles,600000)
        self.assertEqual(triangles,self.provenance['triangles'])
        self.assertLess(len(self.raw),12*1024*1024)
        self.assertEqual(self.gltf['asset']['version'],'2.0')

    def test_embedded_resources_require_no_runtime_downloads(self):
        self.assertTrue(all('uri' not in buffer for buffer in self.gltf['buffers']))
        self.assertTrue(all('uri' not in image for image in self.gltf.get('images',[])))

    def test_provenance_checksum_and_official_source_pin(self):
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(),self.provenance['asset_sha256'])
        self.assertEqual(len(self.raw),self.provenance['asset_bytes'])
        self.assertEqual(self.provenance['source_revision'],'0051697bd2b6c22d557c05ffe8e4b5e43c90490e')
        self.assertEqual(self.provenance['source_step_sha256'],'faab4005da2226e900297e4aa4ed0dab7faf9c259ddeaf20d9db1d5098e6c1ab')
        self.assertEqual(self.provenance['license'],'CC-BY-NC-SA-4.0')
        self.assertEqual(self.provenance['source_assembly'],'printed VT 6mm 2WD')
        self.assertFalse(self.provenance['decimation'])
        self.assertEqual(self.provenance['source_geometry_parts'],246)
        self.assertEqual(self.provenance['meshes'],236)
        self.assertEqual(len(self.provenance['omitted_parts']),10)
        self.assertEqual(sum(p['source_path'].endswith('/SOLID') for p in self.provenance['parts']),7)
        roles=[p['role'] for p in self.provenance['parts']]
        for role in ('belt_a','belt_b','frame','x_axis','tensioner','drive'):
            self.assertIn(role,roles)
        self.assertEqual(roles.count('belt_a'),1)
        self.assertEqual(roles.count('belt_b'),1)
        self.assertEqual(roles.count('tensioner'),2)
        self.assertTrue(all(p['source_path'].startswith('printed VT 6mm 2WD/') for p in self.provenance['parts']))
        self.assertTrue(all('MGN9H specific' not in p['source_path'] for p in self.provenance['parts']))
        self.assertEqual(self.provenance['up_axis'],'Y')
        self.assertEqual(self.provenance['units'],'metres')
        lo,hi=self.provenance['bounds_m']
        self.assertLess(hi[1]-lo[1],.2,'Plain gantry must not contain a full printer frame')
        for axis in (0,2):
            self.assertGreater(hi[axis]-lo[axis],.3)
            self.assertLess(hi[axis]-lo[axis],.6)

if __name__=='__main__':unittest.main()
