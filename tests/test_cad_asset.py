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
        cls.raw=(ROOT/'web/trident.glb').read_bytes()
        cls.provenance=json.loads((ROOT/'web/trident.provenance.json').read_text())
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
        self.assertLess(triangles,400000)
        self.assertEqual(triangles,self.provenance['triangles'])
        self.assertLess(len(self.raw),12*1024*1024)
        self.assertEqual(self.gltf['asset']['version'],'2.0')

    def test_embedded_resources_require_no_runtime_downloads(self):
        self.assertTrue(all('uri' not in buffer for buffer in self.gltf['buffers']))
        self.assertTrue(all('uri' not in image for image in self.gltf.get('images',[])))

    def test_provenance_checksum_and_official_source_pin(self):
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(),self.provenance['asset_sha256'])
        self.assertEqual(len(self.raw),self.provenance['asset_bytes'])
        self.assertEqual(self.provenance['source_revision'],'f04f747d4dea06315806f352abf57f767cedf2b4')
        self.assertEqual(self.provenance['source_zip_sha256'],'9fe5a74f77048603e9289bdfcfa0db60b443252b9236ac3ef39821dc2a91209a')
        self.assertEqual(self.provenance['license'],'GPL-3.0')
        for role in ('belt_a','belt_b','frame','toolhead','bed','gantry'):
            self.assertGreater(self.provenance['groups'][role]['source_components'],0)
        self.assertEqual(self.provenance['up_axis'],'Y')
        self.assertEqual(self.provenance['units'],'metres')

if __name__=='__main__':unittest.main()
