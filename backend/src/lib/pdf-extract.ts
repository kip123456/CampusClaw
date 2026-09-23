export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib: any = await import('pdfjs-dist');
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str || '')
      .join(' ');
    pages.push(pageText);
  }
  return pages.join('\n\n');
}