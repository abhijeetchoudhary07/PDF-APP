import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const OUT_DIR = path.resolve('e2e/test-data/readability');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAll() {
  console.log('Generating Readability PDF fixtures in:', OUT_DIR);

  // 1. Children's Story (Grade 3–5, Easy / Conversational)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage([595.28, 841.89]);
    page.drawText('The Adventures of Spot the Dog', {
      x: 50,
      y: 780,
      size: 18,
      font: bold,
      color: rgb(0.1, 0.4, 0.2)
    });

    const lines = [
      'Tim had a little brown dog named Spot.',
      'Spot liked to run and jump in the green park with all his friends.',
      'One sunny morning, they found a big red rubber ball under a tall oak tree.',
      'Tim threw the ball across the grass, and Spot ran very fast to catch it.',
      'He brought the ball back to Tim with a happy wag of his tail.',
      'They played fetch until the warm sun began to set behind the hills.',
      'Then they walked home together and ate a tasty dinner.',
      'It was a happy and wonderful day for both of them.'
    ];

    lines.forEach((line, idx) => {
      page.drawText(line, {
        x: 50,
        y: 730 - idx * 28,
        size: 12,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'children-story.pdf'), pdfBytes);
    console.log('Saved children-story.pdf');
  }

  // 2. Newspaper Article (Grade 8–10, Moderate / Standard)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage([595.28, 841.89]);
    page.drawText('Community Park Cleanup Draws Record Neighborhood Turnout', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    page.drawText('Published in Metro Daily Tribune · Local Community News', {
      x: 50,
      y: 755,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4)
    });

    const lines = [
      'Local volunteers gathered at the community center on Saturday morning to help clean up the neighborhood park.',
      'Teams picked up litter along the walking trails and planted fresh flowers near the public playground.',
      'The annual event attracted more than fifty families who worked together under bright morning sunshine.',
      'Organizers thanked everyone for their hard work and promised to host another cleanup project next spring.',
      'City officials also announced plans to install new solar lighting fixtures throughout the sports complex.',
      'Residents praised the collaborative effort and expressed hope that the park will stay clean throughout summer.'
    ];

    lines.forEach((line, idx) => {
      page.drawText(line, {
        x: 50,
        y: 710 - idx * 30,
        size: 11,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'newspaper-article.pdf'), pdfBytes);
    console.log('Saved newspaper-article.pdf');
  }

  // 3. Academic Research Paper (Grade 14+, Dense / Academic / Technical — 2 pages)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Page 1
    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('Microstructural Characterization of Cryogenic High-Entropy Alloys', {
      x: 50,
      y: 780,
      size: 15,
      font: bold,
      color: rgb(0.2, 0.1, 0.3)
    });
    p1.drawText('Section 1: Thermodynamic Foundations and Deformation Physics', {
      x: 50,
      y: 745,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });

    const p1Lines = [
      'The thermodynamic characterization of high-entropy alloys demonstrates anomalous microstructural stability under cryogenic mechanical deformation.',
      'Transmission electron microscopy reveals planar dislocation glide and nanotwinning mechanisms which substantially enhance strain hardening capacity.',
      'Consequently, multi-component metallurgical configurations represent an auspicious paradigm for specialized structural applications in aerospace engineering.',
      'Synchrotron X-ray diffraction analyses confirm negligible phase segregation across extensive thermal cycling regimes.'
    ];

    p1Lines.forEach((line, idx) => {
      p1.drawText(line, {
        x: 50,
        y: 705 - idx * 32,
        size: 10,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    });

    // Page 2
    const p2 = doc.addPage([595.28, 841.89]);
    p2.drawText('Section 2: Dislocation Dynamics and Bioremediation Nanostructures', {
      x: 50,
      y: 780,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });

    const p2Lines = [
      'The epidemiological ramifications of pathogenic microorganisms within subterranean aquatic environments demonstrate unprecedented physiological adaptability.',
      'Consequently, environmental bioremediation necessitates comprehensive phylogenetic investigations and rigorous geochemical modeling.',
      'Quantitative spectrophotometric measurements indicate substantial degradation of halogenated aromatic hydrocarbons under anaerobic equilibrium.',
      'Future experimental protocols should integrate localized spectroscopic instrumentation to elucidate transient intermediate complexes.'
    ];

    p2Lines.forEach((line, idx) => {
      p2.drawText(line, {
        x: 50,
        y: 740 - idx * 32,
        size: 10,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'academic-paper.pdf'), pdfBytes);
    console.log('Saved academic-paper.pdf (2 pages)');
  }

  console.log('All Readability PDF fixtures successfully created!');
}

generateAll().catch(err => {
  console.error('Failed generating readability fixtures:', err);
  process.exit(1);
});
