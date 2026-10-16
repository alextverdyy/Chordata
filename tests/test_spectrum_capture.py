"""Measured spectrum publication follows the actual capture lifetime."""
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

from test_chordata import plugin


class SpectrumCaptureTests(unittest.TestCase):
    def capture(self, run_worker):
        times = np.arange(3200) / 3200.
        samples = [(float(t), float(np.sin(2 * np.pi * 91.25 * t)), 0., 0.) for t in times]
        client = SimpleNamespace(msgs=[{"data": samples}], request_start_time=0.,
                                 finish_measurements=lambda: None, get_samples=lambda: samples)
        obj = plugin()
        obj._begin_measurement("A", 5)
        obj.belt_now = "A"
        obj.reactor.register_timer = lambda callback, when: setattr(obj, "tick", callback) or 1
        obj.reactor.unregister_timer = lambda timer: None
        workers, snapshots = [], []

        class Worker:
            def __init__(self, target, args, daemon):
                self.run = lambda: target(*args)
                workers.append(self.run)

            def start(self):
                if run_worker:
                    self.run()

        def dwell(seconds):
            obj.tick(100.)
            snapshots.append(getattr(obj, "belt_spectrum", None))

        with patch("chordata.threading.Thread", Worker), patch("chordata.time.time", return_value=1234567890.):
            obj._record(SimpleNamespace(start_internal_client=lambda: client),
                        SimpleNamespace(dwell=dwell), 2., live={})
        return obj, workers, snapshots

    def test_real_spectrum_updates_during_capture_and_freezes_at_stop(self):
        obj, workers, snapshots = self.capture(run_worker=True)
        live = snapshots[0]
        self.assertTrue(live["active"])
        self.assertEqual(live["captured_at"], 1234567890.)
        self.assertAlmostEqual(live["sample_time_seconds"], 3199 / 3200.)
        peak = int(np.argmax(live["power_db"]))
        self.assertAlmostEqual(live["frequencies_hz"][peak], 91.25, delta=.625)
        self.assertFalse(obj.belt_spectrum["active"])

    def test_late_spectrum_worker_cannot_replace_a_final_snapshot(self):
        obj, workers, snapshots = self.capture(run_worker=False)
        final = {"active": False, "captured_at": 123., "sample_count": 1000}
        obj.belt_spectrum = final
        workers[0]()
        self.assertIs(obj.belt_spectrum, final)

    def test_new_attempt_clears_previous_spectrum_even_on_failure(self):
        obj = plugin()
        obj.belt_spectrum = {"active": False, "sample_count": 1000}
        obj._begin_measurement("A", 5)
        self.assertIsNone(obj.belt_spectrum)
        obj._end_measurement(error="sensor disconnected")
        self.assertIsNone(obj.belt_spectrum)


if __name__ == "__main__":
    unittest.main()
