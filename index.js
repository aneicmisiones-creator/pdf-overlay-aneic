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
      const { pdfBase64, paginas } = body;
      // pageWidthMM y pageHeightMM ya no se usan —
      // las dimensiones se leen directamente del PDF

      if (!pdfBase64 || !paginas || !paginas.length) {
        return new Response('Faltan: pdfBase64, paginas', { status: 400, headers: corsHeaders });
      }

      const pdfBytes    = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
      const templateDoc = await PDFDocument.load(pdfBytes);
      const outputDoc   = await PDFDocument.create();

      // Embeber las 14 fuentes estandar de PDF
      const fontMap = {
        'Helvetica':              await outputDoc.embedFont(StandardFonts.Helvetica),
        'Helvetica-Bold':         await outputDoc.embedFont(StandardFonts.HelveticaBold),
        'Helvetica-Oblique':      await outputDoc.embedFont(StandardFonts.HelveticaOblique),
        'Helvetica-BoldOblique':  await outputDoc.embedFont(StandardFonts.HelveticaBoldOblique),
        'Times-Roman':            await outputDoc.embedFont(StandardFonts.TimesRoman),
        'Times-Bold':             await outputDoc.embedFont(StandardFonts.TimesRomanBold),
        'Times-Italic':           await outputDoc.embedFont(StandardFonts.TimesRomanItalic),
        'Times-BoldItalic':       await outputDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
        'Courier':                await outputDoc.embedFont(StandardFonts.Courier),
        'Courier-Bold':           await outputDoc.embedFont(StandardFonts.CourierBold),
        'Courier-Oblique':        await outputDoc.embedFont(StandardFonts.CourierOblique),
        'Courier-BoldOblique':    await outputDoc.embedFont(StandardFonts.CourierBoldOblique),
        'Symbol':                 await outputDoc.embedFont(StandardFonts.Symbol),
        'ZapfDingbats':           await outputDoc.embedFont(StandardFonts.ZapfDingbats),
      };

      // Leer dimensiones reales del PDF (en puntos: 1mm = 2.835pt)
      const templatePage = templateDoc.getPages()[0];
      const { width: pw, height: ph } = templatePage.getSize();

      for (const paginaData of paginas) {
        const [copia] = await outputDoc.copyPages(templateDoc, [0]);
        outputDoc.addPage(copia);
        const page = outputDoc.getPage(outputDoc.getPageCount() - 1);

        for (const pos of (paginaData.posiciones || [])) {
          if (!pos.valor) continue;

          // Conversion directa mm → puntos usando las dimensiones reales del PDF
          // Sin depender de ninguna configuracion de tamano de hoja
          const MM_TO_PT = 2.835;
          const xPt     = pos.x * MM_TO_PT;
          // Usar la fuente exacta configurada — el usuario elige del desplegable
          // que ya incluye las variantes Bold/Italic en el nombre
          const fontKey = (pos.fuente && fontMap[pos.fuente]) ? pos.fuente : 'Helvetica';
          const font    = fontMap[fontKey];

          let size = parseFloat(pos.tam) || 10;
          if (pos.ancho && pos.ancho > 0) {
            const anchoPt = pos.ancho * MM_TO_PT;
            const wText   = font.widthOfTextAtSize(pos.valor, size);
            if (wText > anchoPt) size = (anchoPt / wText) * size;
          }

          // Y: Canva mide desde arriba hasta la esquina superior del texto.
          // pdf-lib posiciona por la baseline.
          // font.heightAtSize(size) da la altura exacta de la fuente a ese tamaño,
          // que es la distancia entre la esquina superior y la baseline.
          const yCanvaPt = pos.y * MM_TO_PT;
          const yBasePt  = ph - yCanvaPt - font.heightAtSize(size);

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
