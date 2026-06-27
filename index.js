import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

export default {
  async fetch(request) {

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Solo POST', { status: 405, headers: corsHeaders });
    }

    try {
      const body = await request.json();
      const { pdfBase64, paginas, pageWidthMM, pageHeightMM } = body;

      if (!pdfBase64 || !paginas || !paginas.length) {
        return new Response('Faltan: pdfBase64, paginas', { status: 400, headers: corsHeaders });
      }

      const pdfBytes    = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
      const templateDoc = await PDFDocument.load(pdfBytes);
      const outputDoc   = await PDFDocument.create();

      const fonts = {
        normal: await outputDoc.embedFont(StandardFonts.Helvetica),
        bold:   await outputDoc.embedFont(StandardFonts.HelveticaBold),
      };

      for (const paginaData of paginas) {
        const [copia] = await outputDoc.copyPagesFrom(templateDoc, [0]);
        outputDoc.addPage(copia);
        const page = outputDoc.getPage(outputDoc.getPageCount() - 1);
        const { width: pw, height: ph } = page.getSize();

        for (const pos of (paginaData.posiciones || [])) {
          if (!pos.valor) continue;

          const xPt    = (pos.x / pageWidthMM) * pw;
          const yTopPt = ph - (pos.y / pageHeightMM) * ph;
          const font   = pos.negrita ? fonts.bold : fonts.normal;

          let size = parseFloat(pos.tam) || 10;
          if (pos.ancho && pos.ancho > 0) {
            const anchoPt = (pos.ancho / pageWidthMM) * pw;
            const wText   = font.widthOfTextAtSize(pos.valor, size);
            if (wText > anchoPt) size = (anchoPt / wText) * size;
          }

          const yBasePt = yTopPt - size;

          let color = rgb(0, 0, 0);
          const hex = (pos.color || '#000000').replace('#', '');
          if (hex.length === 6) {
            color = rgb(
              parseInt(hex.slice(0, 2), 16) / 255,
              parseInt(hex.slice(2, 4), 16) / 255,
              parseInt(hex.slice(4, 6), 16) / 255
            );
          }

          page.drawText(String(pos.valor), {
            x:      xPt,
            y:      Math.max(yBasePt, 0),
            size:   Math.max(size, 4),
            font:   font,
            color:  color,
            rotate: degrees(parseFloat(pos.angulo) || 0),
          });
        }
      }

      const result = await outputDoc.save();
      return new Response(result, {
        headers: {
          ...corsHeaders,
          'Content-Type':        'application/pdf',
          'Content-Disposition': 'inline; filename="output.pdf"',
        },
      });

    } catch (err) {
      console.error(err);
      return new Response('Error: ' + err.message, {
        status: 500,
        headers: corsHeaders,
      });
    }
  }
};
