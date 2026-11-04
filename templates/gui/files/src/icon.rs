// ============================================================================
// Module:       @@module@@
// Description:  Every icon in the app as geometry on a 16x16 grid: the shapes,
//               not the painting.
//
// Dependencies: none, deliberately: see the module docs.
// ============================================================================

//! The icon set, as geometry.
//!
//! egui's bundled fonts cover Latin, Greek, Cyrillic and some emoji, and
//! almost nothing in the Geometric Shapes or Dingbats blocks, which is where
//! every icon-shaped character lives. A glyph the font lacks renders as an
//! empty box. An icon font is a megabyte of binary and a licence; SVGs need
//! loading and caching. An icon at this size is four to eight line segments,
//! so the icons are **drawn**: they take the theme's colour, scale to any
//! size, and cannot fail to load.
//!
//! Nothing here mentions egui; `gui::ui::icon` maps the paths onto a rect.
//! That split is what lets the tests below check the properties that make
//! an icon set look homemade when they fail: every icon stays inside its
//! grid, is optically centred, and reaches far enough across the grid to
//! match its neighbours.

/// The design grid every icon is drawn on, in grid units.
pub const GRID: f32 = 16.0;

/// The stroke weight, in grid units. 1.5 rather than 1.0, so a 16 px icon
/// carries the same weight as the label beside it.
pub const WEIGHT: f32 = 1.5;

/// Every icon the app draws.
///
/// One enum, so `wildcard_enum_match_arm` fails the build in
/// [`Icon::strokes`] until a new variant is actually drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Icon {
    /// The overview page: four tiles.
    Grid,
    /// The palette page: a swatch wheel.
    Palette,
    /// The about page, and informational notes.
    Info,
    /// Settings: two sliders.
    Settings,
    /// Collapse or expand the sidebar.
    Menu,
    /// Search, and the command palette's field.
    Search,
    /// Dismiss, close.
    Close,
    /// Something is done or selected.
    Check,
    /// Something needs attention.
    Warning,
    /// Speed.
    Bolt,
    /// Stacked layers.
    Layers,
    /// Something new or delightful.
    Sparkle,
    /// A pulse line: activity.
    Activity,
    /// A folder.
    Folder,
    /// A light theme, a sun.
    Sun,
    /// A command prompt: the command palette.
    Command,
}

impl Icon {
    /// Every icon, in declaration order.
    pub const ALL: [Self; 16] = [
        Self::Grid,
        Self::Palette,
        Self::Info,
        Self::Settings,
        Self::Menu,
        Self::Search,
        Self::Close,
        Self::Check,
        Self::Warning,
        Self::Bolt,
        Self::Layers,
        Self::Sparkle,
        Self::Activity,
        Self::Folder,
        Self::Sun,
        Self::Command,
    ];

    /// The paths this icon is drawn from, in grid units.
    #[must_use]
    pub fn strokes(self) -> Vec<Path> {
        match self {
            Self::Grid => vec![
                Path::closed(&[(3.0, 3.0), (7.0, 3.0), (7.0, 7.0), (3.0, 7.0)]),
                Path::closed(&[(9.0, 3.0), (13.0, 3.0), (13.0, 7.0), (9.0, 7.0)]),
                Path::closed(&[(3.0, 9.0), (7.0, 9.0), (7.0, 13.0), (3.0, 13.0)]),
                Path::closed(&[(9.0, 9.0), (13.0, 9.0), (13.0, 13.0), (9.0, 13.0)]),
            ],
            Self::Palette => vec![
                Path::circle(8.0, 8.0, 5.5),
                Path::dot(6.0, 6.0),
                Path::dot(10.0, 6.0),
                Path::dot(6.0, 10.0),
                Path::dot(10.0, 10.0),
            ],
            Self::Info => vec![
                Path::circle(8.0, 8.0, 6.0),
                Path::dot(8.0, 5.0),
                Path::open(&[(7.0, 7.5), (8.0, 7.5), (8.0, 11.5), (9.0, 11.5)]),
            ],
            // Two rails with handles at different positions: equal ones read
            // as a pattern rather than as controls that have been set.
            Self::Settings => vec![
                Path::open(&[(2.5, 5.5), (13.5, 5.5)]),
                Path::circle(6.0, 5.5, 1.8),
                Path::open(&[(2.5, 10.5), (13.5, 10.5)]),
                Path::circle(10.5, 10.5, 1.8),
            ],
            Self::Menu => vec![
                Path::open(&[(3.0, 4.5), (13.0, 4.5)]),
                Path::open(&[(3.0, 8.0), (13.0, 8.0)]),
                Path::open(&[(3.0, 11.5), (13.0, 11.5)]),
            ],
            Self::Search => vec![
                Path::circle(7.0, 7.0, 4.0),
                Path::open(&[(10.0, 10.0), (13.5, 13.5)]),
            ],
            Self::Close => vec![
                Path::open(&[(4.5, 4.5), (11.5, 11.5)]),
                Path::open(&[(11.5, 4.5), (4.5, 11.5)]),
            ],
            Self::Check => vec![Path::open(&[(3.5, 8.5), (6.5, 11.5), (12.5, 5.0)])],
            Self::Warning => vec![
                Path::closed(&[(8.0, 2.5), (14.0, 13.0), (2.0, 13.0)]),
                Path::open(&[(8.0, 6.5), (8.0, 9.5)]),
                Path::dot(8.0, 11.3),
            ],
            Self::Bolt => vec![Path::closed(&[
                (9.0, 2.0),
                (4.0, 9.0),
                (8.0, 9.0),
                (7.0, 14.0),
                (12.0, 7.0),
                (8.0, 7.0),
            ])],
            Self::Layers => vec![
                Path::closed(&[(8.0, 3.0), (13.5, 6.0), (8.0, 9.0), (2.5, 6.0)]),
                Path::open(&[(2.5, 9.5), (8.0, 12.5), (13.5, 9.5)]),
            ],
            Self::Sparkle => vec![Path::closed(&[
                (8.0, 2.0),
                (9.5, 6.5),
                (14.0, 8.0),
                (9.5, 9.5),
                (8.0, 14.0),
                (6.5, 9.5),
                (2.0, 8.0),
                (6.5, 6.5),
            ])],
            Self::Activity => vec![Path::open(&[
                (2.0, 8.5),
                (5.0, 8.5),
                (6.5, 4.0),
                (9.5, 12.0),
                (11.0, 8.5),
                (14.0, 8.5),
            ])],
            Self::Folder => vec![Path::closed(&[
                (2.5, 12.5),
                (2.5, 4.0),
                (6.5, 4.0),
                (8.0, 6.0),
                (13.5, 6.0),
                (13.5, 12.5),
            ])],
            // A disc and eight rays. Eight rather than twelve: at 16 px
            // twelve close up into a solid ring.
            Self::Sun => {
                let mut paths = vec![Path::circle(8.0, 8.0, 2.8)];
                for index in 0..8 {
                    let angle = std::f32::consts::TAU * index as f32 / 8.0;
                    let (sin, cos) = angle.sin_cos();
                    paths.push(Path::open(&[
                        (8.0 + cos * 4.6, 8.0 + sin * 4.6),
                        (8.0 + cos * 6.0, 8.0 + sin * 6.0),
                    ]));
                }
                paths
            }
            Self::Command => vec![
                Path::open(&[(3.0, 4.5), (7.0, 8.0), (3.0, 11.5)]),
                Path::open(&[(8.5, 11.5), (13.0, 11.5)]),
            ],
        }
    }
}

/// One stroked path in grid space.
#[derive(Clone, Debug, PartialEq)]
pub struct Path {
    /// The points, in grid units.
    pub points: Vec<(f32, f32)>,
    /// Whether the last point joins back to the first.
    pub closed: bool,
}

impl Path {
    /// A polyline.
    fn open(points: &[(f32, f32)]) -> Self {
        Self {
            points: points.to_vec(),
            closed: false,
        }
    }

    /// A polyline whose end joins its start.
    fn closed(points: &[(f32, f32)]) -> Self {
        Self {
            points: points.to_vec(),
            closed: true,
        }
    }

    /// A circle as a closed sixteen-segment polygon: under a pixel from a
    /// true circle at these sizes, and stroked like everything else.
    fn circle(cx: f32, cy: f32, radius: f32) -> Self {
        /// Segments per full turn.
        const SEGMENTS: usize = 16;
        let points = (0..SEGMENTS)
            .map(|step| {
                let angle = std::f32::consts::TAU * step as f32 / SEGMENTS as f32;
                let (sin, cos) = angle.sin_cos();
                (cx + cos * radius, cy + sin * radius)
            })
            .collect();
        Self {
            points,
            closed: true,
        }
    }

    /// A dot: a zero-length round-capped stroke paints a disc of the
    /// stroke's width, so it takes the icon's colour and weight for free.
    fn dot(x: f32, y: f32) -> Self {
        Self::open(&[(x, y), (x, y)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // `ALL` names each icon exactly once, checked at compile time: the
    // discriminants of a field-less enum are its declaration positions, so a
    // missing or repeated entry leaves a gap or a duplicate.
    const _: () = {
        let mut seen = [false; Icon::ALL.len()];
        let mut index = 0;
        while index < Icon::ALL.len() {
            let variant = Icon::ALL[index] as usize;
            assert!(variant < seen.len(), "an Icon variant is missing from ALL");
            assert!(!seen[variant], "ALL names the same icon twice");
            seen[variant] = true;
            index += 1;
        }
    };

    /// The bounding box of an icon's ink, as `(min_x, min_y, max_x, max_y)`.
    fn bounds(icon: Icon) -> anyhow::Result<(f32, f32, f32, f32)> {
        let points: Vec<(f32, f32)> = icon.strokes().into_iter().flat_map(|p| p.points).collect();
        let Some(&(x, y)) = points.first() else {
            anyhow::bail!("{icon:?} draws nothing at all");
        };
        Ok(points.iter().fold((x, y, x, y), |(a, b, c, d), (x, y)| {
            (a.min(*x), b.min(*y), c.max(*x), d.max(*y))
        }))
    }

    #[test]
    fn every_icon_stays_inside_the_grid() -> anyhow::Result<()> {
        for icon in Icon::ALL {
            let (min_x, min_y, max_x, max_y) = bounds(icon)?;
            assert!(
                min_x >= 0.0 && min_y >= 0.0 && max_x <= GRID && max_y <= GRID,
                "{icon:?} leaves the 0..={GRID} grid and would be clipped"
            );
        }
        Ok(())
    }

    #[test]
    fn every_icon_is_optically_centred() -> anyhow::Result<()> {
        for icon in Icon::ALL {
            let (min_x, min_y, max_x, max_y) = bounds(icon)?;
            let (cx, cy) = ((min_x + max_x) / 2.0, (min_y + max_y) / 2.0);
            assert!(
                (cx - GRID / 2.0).abs() <= 1.0 && (cy - GRID / 2.0).abs() <= 1.0,
                "{icon:?} is centred at ({cx}, {cy})"
            );
        }
        Ok(())
    }

    #[test]
    fn every_icon_fills_enough_of_its_grid_to_match_its_neighbours() -> anyhow::Result<()> {
        for icon in Icon::ALL {
            let (min_x, min_y, max_x, max_y) = bounds(icon)?;
            let span = (max_x - min_x).max(max_y - min_y);
            assert!(span >= 7.0, "{icon:?} spans only {span} grid units");
        }
        Ok(())
    }
}
