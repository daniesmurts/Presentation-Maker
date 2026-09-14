import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { identifyOoxml } from './fileType'

async function zipWith(...names: string[]): Promise<Buffer> {
  const zip = new JSZip()
  for (const n of names) zip.file(n, '<x/>')
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('identifyOoxml — a zip signature is not a format', () => {
  it('tells the three OOXML formats apart by part layout', async () => {
    expect(identifyOoxml(await zipWith('[Content_Types].xml', 'ppt/slides/slide1.xml'))).toBe('pptx')
    expect(identifyOoxml(await zipWith('[Content_Types].xml', 'word/document.xml'))).toBe('docx')
    expect(identifyOoxml(await zipWith('[Content_Types].xml', 'xl/workbook.xml'))).toBe('xlsx')
  })
  it('a Word document with an embedded deck is Word — checked first', async () => {
    expect(identifyOoxml(await zipWith('word/document.xml', 'word/embeddings/oleObject1.bin', 'ppt/slides/slide1.xml'))).toBe('docx')
  })
  it('a zip that is not OOXML, or not a zip at all, is null', async () => {
    expect(identifyOoxml(await zipWith('readme.txt'))).toBeNull()
    expect(identifyOoxml(Buffer.from('not a zip'))).toBeNull()
    expect(identifyOoxml(Buffer.alloc(0))).toBeNull()
  })
})
