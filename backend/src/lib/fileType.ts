// A zip signature is not a format (CLAUDE.md §3.7). .docx, .pptx and .xlsx
// all start 50 4B 03 04; mapping that to one MIME type rejected every .pptx
// ever uploaded to the parent (production, 2026-09-08). What distinguishes
// them is the part layout, and a zip stores each entry's name uncompressed
// in its local file header — readable in the raw bytes without unzipping.
// Word is checked FIRST: a .docx may embed a deck, but at word/embeddings/…,
// never at ppt/slides/.

export type OoxmlKind = 'docx' | 'pptx' | 'xlsx'

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])

const OOXML_PARTS: [string, OoxmlKind][] = [
  ['word/document.xml', 'docx'],
  ['ppt/slides/',       'pptx'],
  ['xl/workbook.xml',   'xlsx'],
]

export function identifyOoxml(buffer: Buffer): OoxmlKind | null {
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) return null
  for (const [part, kind] of OOXML_PARTS) {
    if (buffer.includes(part, 0, 'latin1')) return kind
  }
  return null   // a zip, but not recognisably OOXML — "unknown", not "wrong"
}
