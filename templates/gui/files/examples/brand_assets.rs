// ============================================================================
// Module:       @@module@@
// Description:  Writes the mark's derived files: the multi-size .ico that
//               build.rs embeds in the executable.
//
// Dependencies: @@crate@@::brand (the geometry and the rasteriser); std only
// ============================================================================

//! `cargo run --example brand_assets`
//!
//! Regenerates `assets/@@name@@.ico` from the single definition in
//! `src/brand.rs`. Run it after changing the mark or the accent; the file is
//! committed so a build never needs to run this first.
//!
//! The `.ico` holds uncompressed 32-bit images at each size Windows asks
//! for, written by hand: the format is a directory and a few headers, and a
//! dependency to write it would cost more build time than this file.

use std::path::Path;

/// The sizes Windows picks from: title bar, taskbar, Explorer, Alt-Tab.
const SIZES: [u32; 5] = [16, 24, 32, 48, 64];

fn main() -> anyhow::Result<()> {
    let out = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join("@@name@@.ico");
    let images: Vec<(u32, Vec<u8>)> = SIZES
        .iter()
        .map(|&edge| (edge, @@crate@@::brand::rasterise(edge)))
        .collect();
    std::fs::write(&out, ico(&images)?)?;
    println!("wrote {}", out.display());
    Ok(())
}

/// Encodes RGBA images as one `.ico` of 32-bit BMP entries.
fn ico(images: &[(u32, Vec<u8>)]) -> anyhow::Result<Vec<u8>> {
    let entries: Vec<Vec<u8>> = images
        .iter()
        .map(|(edge, rgba)| bmp_entry(*edge, rgba))
        .collect::<anyhow::Result<_>>()?;
    let count = u16::try_from(entries.len())?;
    let mut file = Vec::new();
    // ICONDIR: reserved, type 1 (icon), image count.
    file.extend_from_slice(&0u16.to_le_bytes());
    file.extend_from_slice(&1u16.to_le_bytes());
    file.extend_from_slice(&count.to_le_bytes());
    let mut offset = 6 + 16 * entries.len();
    for ((edge, _), entry) in images.iter().zip(&entries) {
        // A width of 256 is stored as 0; every size here is smaller.
        let side = u8::try_from(*edge)?;
        file.extend_from_slice(&[side, side, 0, 0]);
        file.extend_from_slice(&1u16.to_le_bytes()); // colour planes
        file.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
        file.extend_from_slice(&u32::try_from(entry.len())?.to_le_bytes());
        file.extend_from_slice(&u32::try_from(offset)?.to_le_bytes());
        offset += entry.len();
    }
    for entry in entries {
        file.extend_from_slice(&entry);
    }
    Ok(file)
}

/// One icon image: a BITMAPINFOHEADER, BGRA rows bottom-up, then the
/// 1-bit AND mask (all zero: the alpha channel carries the shape).
fn bmp_entry(edge: u32, rgba: &[u8]) -> anyhow::Result<Vec<u8>> {
    let side = usize::try_from(edge)?;
    anyhow::ensure!(
        rgba.len() == side * side * 4,
        "a {edge}px image needs {} bytes",
        side * side * 4
    );
    let mask_row = side.div_ceil(32) * 4;
    let mut out = Vec::new();
    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&i32::try_from(edge)?.to_le_bytes());
    // The height counts the colour image and the mask together.
    out.extend_from_slice(&i32::try_from(edge * 2)?.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&[0; 24]); // BI_RGB, sizes and palette left zero
    for row in rgba.chunks_exact(side * 4).rev() {
        for [r, g, b, a] in row.as_chunks::<4>().0 {
            out.extend_from_slice(&[*b, *g, *r, *a]);
        }
    }
    out.extend(std::iter::repeat_n(0u8, mask_row * side));
    Ok(out)
}
