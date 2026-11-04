// ============================================================================
// Module:       @@module@@
// Description:  The egui binding for crate::motion: the helpers that read and
//               advance an animation held in the Context.
//
// Dependencies: egui (the animation state lives in its Context); crate::motion
// ============================================================================

//! Animation, as egui holds it.
//!
//! [`crate::motion`] owns the curves and the four durations; this module is
//! the part that needs a `Context`. egui keeps a value per [`egui::Id`] and
//! advances it, which is what lets an animation survive an immediate-mode
//! redraw that has no memory of the previous frame. **Drawing code animates
//! only through here**, so no call site picks its own duration.
//!
//! ## Ids name the thing, not its position
//!
//! An id built from a loop index animates the *position*: remove the third
//! card and every card below inherits its neighbour's animation state.
//! Derive ids from an identity that survives reordering.
//!
//! ## Reduced motion
//!
//! [`set_reduced`] (from the settings page) makes every helper here land on
//! its end state at once, for anyone who finds movement distracting.

pub use crate::motion::{ENTER, INSTANT, QUICK, SETTLE};

use egui::{Context, Id};
use std::cell::Cell;

thread_local! {
    /// Whether animations are switched off. Thread-local because egui is
    /// single-threaded per context and this is read many times per frame.
    static REDUCED: Cell<bool> = const { Cell::new(false) };
}

/// Switches animation off (or back on) for every helper in this module.
pub fn set_reduced(reduced: bool) {
    REDUCED.with(|cell| cell.set(reduced));
}

/// Whether animation is switched off.
#[must_use]
pub fn reduced() -> bool {
    REDUCED.with(Cell::get)
}

/// How far a boolean animation has progressed, 0..=1, eased out.
#[must_use]
pub fn toggle(ctx: &Context, id: Id, on: bool, seconds: f32) -> f32 {
    let seconds = if reduced() { 0.0 } else { seconds };
    crate::motion::ease_out(ctx.animate_bool_with_time(id, on, seconds))
}

/// [`toggle`] with the symmetric curve, for a change no pointer is driving.
#[must_use]
pub fn transition(ctx: &Context, id: Id, on: bool, seconds: f32) -> f32 {
    let seconds = if reduced() { 0.0 } else { seconds };
    crate::motion::ease_in_out(ctx.animate_bool_with_time(id, on, seconds))
}

/// A continuous value that chases its target over [`SETTLE`].
///
/// egui returns the *target* on the first observation of an id, so a value
/// scrolling into view shows its real level at once rather than animating
/// up from zero.
#[must_use]
pub fn value(ctx: &Context, id: Id, target: f32) -> f32 {
    // A non-finite target would be stored and compared against forever,
    // so the animation would never converge.
    let target = if target.is_finite() { target } else { 0.0 };
    let seconds = if reduced() { 0.0 } else { SETTLE };
    ctx.animate_value_with_time(id, target, seconds)
}

/// How far something keyed `key` has progressed since it arrived, 0..=1,
/// eased out over [`ENTER`]: a page fading in after a page change.
///
/// Unlike [`toggle`], this starts at 0 the first time `key` is seen under
/// `id` (egui's own animations return their target on first sight), and it
/// restarts whenever `key` changes.
#[must_use]
pub fn arrival(ctx: &Context, id: Id, key: Id) -> f32 {
    if reduced() {
        return 1.0;
    }
    let now = ctx.input(|input| input.time);
    let start = ctx.data_mut(|data| {
        let slot = data.get_temp_mut_or_insert_with(id, || (key, now));
        if slot.0 != key {
            *slot = (key, now);
        }
        slot.1
    });
    let t = ((now - start) as f32 / ENTER).clamp(0.0, 1.0);
    if t < 1.0 {
        ctx.request_repaint();
    }
    crate::motion::ease_out(t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_non_finite_target_settles_rather_than_getting_stuck() {
        let ctx = Context::default();
        let id = Id::unique("nonsense-target");
        assert!(value(&ctx, id, f32::NAN).is_finite());
        assert!(value(&ctx, id, f32::INFINITY).is_finite());
    }

    #[test]
    fn the_first_observation_of_a_value_is_its_target() {
        let ctx = Context::default();
        let landed = value(&ctx, Id::unique("real-target"), 42.0);
        assert!((landed - 42.0).abs() < f32::EPSILON, "got {landed}");
    }

    #[test]
    fn reduced_motion_lands_immediately() {
        let ctx = Context::default();
        set_reduced(true);
        let id = Id::unique("reduced");
        let _ = toggle(&ctx, id, false, QUICK);
        let landed = toggle(&ctx, id, true, QUICK);
        set_reduced(false);
        assert!((landed - 1.0).abs() < f32::EPSILON, "got {landed}");
    }
}
