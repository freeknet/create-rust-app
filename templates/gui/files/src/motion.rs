// ============================================================================
// Module:       @@module@@
// Description:  The easing curves, the four named durations, and the tween that
//               makes a value arrive rather than appear.
//
// Dependencies: none, deliberately: see the module docs.
// ============================================================================

//! Motion, in one place.
//!
//! egui offers `Context::animate_bool_with_time`, and reaching for it at
//! each call site is how an app ends up with a hover that fades over 0.1 s
//! beside a panel that slides over 0.25 s, with no one decision anywhere
//! about what the app's motion should feel like. So every animation goes
//! through here, and the durations are four named constants.
//!
//! Nothing in this file mentions egui: a curve is arithmetic and a tween is
//! a number chasing another number, so their tests run on any machine.
//! `gui::ui::motion` holds the part that needs a `Context`.
//!
//! ## The four durations
//!
//! - [`INSTANT`]: a hover, a press. The ramp only stops the change reading
//!   as a flicker; anything longer lags the pointer.
//! - [`QUICK`]: a selection moving, a card lifting, a modal arriving.
//! - [`SETTLE`]: a value changing on its own: a meter finding its level.
//! - [`ENTER`]: a whole page arriving.
//!
//! ## The curves
//!
//! Nothing moves linearly; a linear ramp reads as mechanical.
//! [`ease_out`] for anything responding to input, [`ease_in_out`] for a
//! move between two resting states, [`spring`] for a value that should feel
//! like it has mass.

/// A hover, a press: a response to a pointer that is already there.
pub const INSTANT: f32 = 0.12;

/// A selection, a disclosure, a card lifting.
pub const QUICK: f32 = 0.18;

/// A value arriving on its own.
pub const SETTLE: f32 = 0.35;

/// A whole page arriving.
pub const ENTER: f32 = 0.22;

// Relations between constants, checked when the crate is compiled.
const _: () = {
    assert!(
        INSTANT >= 0.06 && INSTANT <= 0.15,
        "under ~60ms a hover reads as a switch; over ~150ms as lag"
    );
    assert!(QUICK > INSTANT, "the larger change should take longer");
    assert!(
        SETTLE > QUICK,
        "state settles more slowly than input resolves"
    );
    assert!(
        ENTER <= SETTLE && ENTER <= 0.3,
        "past ~300ms a page change is a wait"
    );
};

/// An ease-out cubic: leaves fast, settles gently.
#[must_use]
pub fn ease_out(t: f32) -> f32 {
    let t = clamp01(t);
    1.0 - (1.0 - t).powi(3)
}

/// An ease-in-out cubic: gentle at both ends.
#[must_use]
pub fn ease_in_out(t: f32) -> f32 {
    let t = clamp01(t);
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

/// A damped spring: overshoots slightly, then settles.
///
/// The overshoot is small on purpose: a bouncy interface is charming once
/// and irritating by the fiftieth time.
#[must_use]
pub fn spring(t: f32) -> f32 {
    /// The back-ease constant; about 4% overshoot.
    const OVERSHOOT: f32 = 1.7;
    let t = clamp01(t);
    if t >= 1.0 {
        return 1.0;
    }
    let t = t - 1.0;
    1.0 + (OVERSHOOT + 1.0) * t.powi(3) + OVERSHOOT * t.powi(2)
}

/// `t`, clamped, with a non-finite input treated as the start.
///
/// A NaN reaching a curve poisons a position, which poisons a rect, which
/// egui declines to draw: one bad value would make a control vanish.
fn clamp01(t: f32) -> f32 {
    // `f32::clamp` passes a NaN through, so it is replaced first.
    let t = if t.is_nan() { 0.0 } else { t };
    t.clamp(0.0, 1.0)
}

/// A value that chases its target, for state the app owns and advances
/// itself rather than state keyed on an egui id.
#[derive(Clone, Copy, Debug)]
pub struct Tween {
    /// Where the value is now.
    current: f32,
    /// Where it is heading.
    target: f32,
    /// How long a full journey takes, in seconds.
    seconds: f32,
}

impl Tween {
    /// Below this a difference is under a tenth of a pixel, and chasing it
    /// would cost a repaint per frame forever.
    const EPSILON: f32 = 0.001;

    /// A tween already at `value`, so it does not animate into place.
    #[must_use]
    pub fn new(value: f32, seconds: f32) -> Self {
        Self {
            current: value,
            target: value,
            seconds: seconds.max(f32::EPSILON),
        }
    }

    /// Points the tween at a new target, leaving it where it is.
    pub fn set(&mut self, target: f32) {
        if target.is_finite() {
            self.target = target;
        }
    }

    /// Jumps straight to `value`, cancelling any journey in progress.
    pub fn snap(&mut self, value: f32) {
        if value.is_finite() {
            self.current = value;
            self.target = value;
        }
    }

    /// Advances by `delta` seconds and returns the new value.
    ///
    /// Frame-rate independent: the same motion takes the same wall-clock
    /// time at 60 Hz and at 144 Hz.
    pub fn advance(&mut self, delta: f32) -> f32 {
        if !delta.is_finite() || delta <= 0.0 {
            return self.current;
        }
        let t = clamp01(delta / self.seconds);
        self.current += (self.target - self.current) * ease_out(t);
        if (self.target - self.current).abs() < Self::EPSILON {
            self.current = self.target;
        }
        self.current
    }

    /// The value as it stands.
    #[must_use]
    pub fn get(self) -> f32 {
        self.current
    }

    /// The value it is heading for.
    #[must_use]
    pub fn target(self) -> f32 {
        self.target
    }

    /// Whether the tween has arrived, so no repaint is needed for it.
    #[must_use]
    pub fn finished(self) -> bool {
        (self.target - self.current).abs() < Self::EPSILON
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A curve and its name.
    type Curve = (&'static str, fn(f32) -> f32);

    /// Every curve, by name.
    const CURVES: [Curve; 3] = [
        ("ease_out", ease_out),
        ("ease_in_out", ease_in_out),
        ("spring", spring),
    ];

    #[test]
    fn every_curve_runs_from_zero_to_one() {
        for (name, curve) in CURVES {
            assert!(curve(0.0).abs() < 1e-5, "{name} starts at {}", curve(0.0));
            assert!(
                (curve(1.0) - 1.0).abs() < 1e-5,
                "{name} ends at {}",
                curve(1.0)
            );
        }
    }

    #[test]
    fn the_eased_curves_never_move_backwards() {
        for (name, curve) in CURVES.into_iter().take(2) {
            let mut previous = curve(0.0);
            for step in 1..=100 {
                let value = curve(step as f32 / 100.0);
                assert!(value >= previous - 1e-6, "{name} reverses at step {step}");
                previous = value;
            }
        }
    }

    #[test]
    fn spring_overshoots_a_little_and_comes_back() {
        let peak = (0..=100)
            .map(|step| spring(step as f32 / 100.0))
            .fold(f32::MIN, f32::max);
        assert!(peak > 1.0, "spring never passes its target");
        assert!(
            peak < 1.15,
            "spring overshoots by {:.0}%",
            (peak - 1.0) * 100.0
        );
    }

    #[test]
    fn a_curve_given_nonsense_starts_rather_than_vanishing() {
        for (name, curve) in CURVES {
            assert!(curve(f32::NAN).is_finite(), "{name} passes NaN through");
            assert!(curve(f32::INFINITY).is_finite(), "{name} passes infinity");
        }
    }

    #[test]
    fn a_tween_arrives_and_then_stops_asking_for_frames() {
        let mut tween = Tween::new(0.0, QUICK);
        tween.set(100.0);
        assert!(!tween.finished(), "a new target has not been reached yet");
        for _ in 0..60 {
            tween.advance(1.0 / 60.0);
        }
        assert!(tween.finished(), "still at {} after a second", tween.get());
        assert!(
            (tween.get() - 100.0).abs() < 0.1,
            "settled at {}",
            tween.get()
        );
    }

    #[test]
    fn a_tween_takes_the_same_time_at_any_refresh_rate() {
        let mut sixty = Tween::new(0.0, SETTLE);
        let mut fast = Tween::new(0.0, SETTLE);
        sixty.set(1.0);
        fast.set(1.0);
        for _ in 0..30 {
            sixty.advance(1.0 / 60.0);
        }
        for _ in 0..72 {
            fast.advance(1.0 / 144.0);
        }
        let difference = (sixty.get() - fast.get()).abs();
        assert!(
            difference < 0.05,
            "60 Hz {} vs 144 Hz {}",
            sixty.get(),
            fast.get()
        );
    }

    #[test]
    fn a_tween_ignores_nonsense_rather_than_getting_stuck_on_it() {
        let mut tween = Tween::new(5.0, QUICK);
        tween.set(f32::NAN);
        tween.advance(1.0 / 60.0);
        assert!(tween.get().is_finite(), "a NaN target poisoned the tween");
        let before = tween.get();
        tween.advance(-1.0);
        assert!(
            (tween.get() - before).abs() < f32::EPSILON,
            "a negative delta moved it"
        );
    }

    #[test]
    fn snapping_cancels_the_journey() {
        let mut tween = Tween::new(0.0, SETTLE);
        tween.set(1000.0);
        tween.advance(1.0 / 60.0);
        tween.snap(7.0);
        assert!(tween.finished() && (tween.get() - 7.0).abs() < f32::EPSILON);
    }
}
