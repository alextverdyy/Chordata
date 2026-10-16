"""Independent regressions for timing integrity, completion and measured spectra."""
import copy
import json
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import chordata_belts as belts


def recording(frequency=109.78, frequencies=None, jitter=False):
    """Five reproducible decaying F/2F plucks sampled against their true times."""
    rng = np.random.default_rng(8675309)
    fs = 3200.
    times = np.arange(int(8 * fs)) / fs
    if jitter:
        times += .025 / fs * np.sin(np.arange(len(times)) * .11)
    axes = [rng.normal(0., 20., len(times)) for _ in range(3)]
    for onset, tone in zip((1., 2.2, 3.4, 4.6, 5.8), frequencies or [frequency] * 5):
        dt = times - onset
        decay = np.where(dt >= 0, np.exp(-np.maximum(dt, 0.) / .45), 0.)
        fundamental = 1200. * decay * np.sin(2 * np.pi * tone * dt)
        harmonic = 3000. * decay ** 2 * np.sin(4 * np.pi * tone * dt)
        axes[0] += .3 * fundamental + .7 * harmonic
        axes[1] += -.3 * fundamental + .7 * harmonic
        axes[2] += .4 * fundamental
    quiet = [rng.normal(0., 20., int(1.5 * fs)) for _ in range(3)]
    return times, axes, quiet


def pair(result, target=110.04, tolerance=.25):
    return dict(target=target, tol=tolerance, plucks=5,
                A=copy.deepcopy(result), B=copy.deepcopy(result))


class IndependentMeasurementTests(unittest.TestCase):
    def test_dropped_sample_is_not_compressed_into_a_frequency(self):
        times, axes, quiet = recording()
        for operation in (belts.analyse, belts.live_spectrum):
            with self.subTest(operation=operation.__name__):
                with self.assertRaisesRegex(ValueError, "sample gap"):
                    operation(np.delete(times, 12000),
                              *(np.delete(axis, 12000) for axis in axes), quiet=quiet)

    def test_bounded_jitter_recovers_actual_time_frequency(self):
        times, axes, quiet = recording(frequency=132.1, jitter=True)
        result = belts.analyse(times, *axes, quiet=quiet, expect=5)
        self.assertTrue(result["quality"]["usable"])
        self.assertTrue(result["metadata"]["timing"]["resampled"])
        self.assertAlmostEqual(result["freq_estimate"], 132.1, delta=.04)

    def test_corrupted_noise_reference_cannot_accept_a_series(self):
        times, axes, quiet = recording()
        qt = np.arange(len(quiet[0])) / 3200.
        background = {"time": np.delete(qt, 2000),
                      "axes": [np.delete(axis, 2000) for axis in quiet]}
        with self.assertRaisesRegex(ValueError, "quiet recording.*sample gap"):
            belts.analyse(times, *axes, quiet=background, expect=5)

    def test_noise_reference_at_wrong_sample_rate_is_rejected(self):
        times, axes, quiet = recording()
        background = {"time": np.arange(len(quiet[0])) / 3000., "axes": quiet}
        with self.assertRaisesRegex(ValueError, "sample rate differs"):
            belts.analyse(times, *axes, quiet=background, expect=5)

    def test_rounding_cannot_make_out_of_tolerance_pair_complete(self):
        times, axes, quiet = recording(frequency=109.78)
        result = belts.analyse(times, *axes, quiet=quiet, expect=5)
        # Display 109.8 Hz lies in 110.04 +/- .25; the actual estimate does not.
        self.assertLessEqual(abs(result["freq"] - 110.04), .25)
        self.assertGreater(abs(result["freq_estimate"] - 110.04), .25)
        message, update = belts.plan(pair(result))
        self.assertFalse(update["done"])
        self.assertIn("Tighten", message)

    def test_near_target_mean_with_wide_repeatability_requires_remeasurement(self):
        times, axes, quiet = recording(frequencies=[109.9, 110.4, 109.9, 110.4, 109.9])
        result = belts.analyse(times, *axes, quiet=quiet, expect=5)
        self.assertTrue(result["quality"]["usable"])
        self.assertLess(abs(result["freq_estimate"] - 110.04), .25)
        self.assertFalse(belts.plan(pair(result))[1]["done"])

    def test_consistent_full_series_can_finish(self):
        times, axes, quiet = recording(frequency=110.04)
        result = belts.analyse(times, *axes, quiet=quiet, expect=5)
        self.assertTrue(result["quality"]["usable"])
        self.assertTrue(belts.plan(pair(result))[1]["done"])

    def test_requested_series_cannot_finish_from_only_three_plucks(self):
        times, axes, quiet = recording(frequency=110.04)
        keep = times < 4.4
        result = belts.analyse(times[keep], *(axis[keep] for axis in axes), quiet=quiet, expect=5)
        self.assertEqual(result["used"], 3)
        self.assertFalse(result["quality"]["usable"])
        self.assertFalse(belts.plan(pair(result))[1]["done"])


class IndependentSpectrumTests(unittest.TestCase):
    def tone(self, frequency=91.25, length=2., amplitude=1.):
        times = np.arange(int(3200 * length)) / 3200.
        signal = amplitude * np.sin(2 * np.pi * frequency * times)
        return times, [signal, signal * .5, np.zeros(len(times))]

    def test_spectrum_peak_is_measured_and_payload_is_bounded(self):
        times, axes = self.tone()
        spectrum = belts.live_spectrum(times, *axes)
        frequencies = np.array(spectrum["frequencies_hz"])
        powers = np.array(spectrum["power_db"])
        self.assertLessEqual(len(frequencies), 256)
        self.assertEqual(len(frequencies), len(powers))
        self.assertTrue(np.isfinite(powers).all())
        self.assertTrue(np.all(np.diff(frequencies) > 0))
        self.assertGreaterEqual(frequencies[0], 25.)
        self.assertLessEqual(frequencies[-1], 500.)
        self.assertAlmostEqual(frequencies[np.argmax(powers)], 91.25, delta=.625)
        self.assertAlmostEqual(float(np.max(powers)), 0., places=8)
        self.assertLess(len(json.dumps(spectrum, allow_nan=False)), 20000)
        self.assertAlmostEqual(spectrum["resolution_hz"], 1 / spectrum["window_seconds"])

    def test_latest_window_excludes_an_old_loud_tone(self):
        times, axes = self.tone(frequency=180.)
        old = times < .8
        axes[0][old] = 100. * np.sin(2 * np.pi * 55. * times[old])
        spectrum = belts.live_spectrum(times, *axes)
        peak = spectrum["frequencies_hz"][int(np.argmax(spectrum["power_db"]))]
        self.assertAlmostEqual(peak, 180., delta=.625)

    def test_relative_spectrum_is_invariant_to_sensor_gain(self):
        times, axes = self.tone()
        first = belts.live_spectrum(times, *axes)
        second = belts.live_spectrum(times, *(axis * 12 for axis in axes))
        np.testing.assert_allclose(first["frequencies_hz"], second["frequencies_hz"])
        np.testing.assert_allclose(first["power_db"], second["power_db"], atol=1e-7)

    def test_low_point_limit_retains_a_narrow_peak(self):
        times, axes = self.tone(frequency=227.5)
        spectrum = belts.live_spectrum(times, *axes, max_points=8)
        self.assertEqual(len(spectrum["frequencies_hz"]), 8)
        peak = spectrum["frequencies_hz"][int(np.argmax(spectrum["power_db"]))]
        self.assertAlmostEqual(peak, 227.5, delta=.625)

    def test_zero_signal_is_not_displayed_as_full_scale(self):
        times, axes = self.tone(amplitude=0.)
        spectrum = belts.live_spectrum(times, *axes)
        self.assertFalse(spectrum["signal_present"])
        self.assertTrue(all(power <= -100. for power in spectrum["power_db"]))


if __name__ == "__main__":
    unittest.main()
