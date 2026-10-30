import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const OUT_DIR = path.resolve('e2e/test-data/contact-calendar');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAll() {
  console.log('Generating Contact & Calendar PDF fixtures in:', OUT_DIR);

  // 1. Horizontal Business Card
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([350, 200]); // Standard Business Card ratio
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    // Accent line
    page.drawRectangle({
      x: 0,
      y: 190,
      width: 350,
      height: 10,
      color: rgb(0.12, 0.35, 0.85)
    });

    page.drawText('Dr. Ananya Roy', { x: 25, y: 155, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('Chief Technology Officer', { x: 25, y: 138, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('Apex AI Technologies Pvt Ltd', { x: 25, y: 122, size: 11, font: boldFont, color: rgb(0.12, 0.35, 0.85) });

    page.drawText('Mob: +91 98765 43210', { x: 25, y: 92, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Work: +91 11 2345 6789', { x: 25, y: 78, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Email: ananya.roy@apexai.example.com', { x: 25, y: 64, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Web: https://www.apexai.example.com', { x: 25, y: 50, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('42 Silicon Corridor, Outer Ring Road, Bengaluru 560103', { x: 25, y: 32, size: 8, font, color: rgb(0.4, 0.4, 0.4) });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'business-card-horizontal.pdf'), bytes);
    console.log('Created business-card-horizontal.pdf');
  }

  // 2. Vertical Business Card
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 350]); // Vertical card
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    page.drawText('Oliver Brown', { x: 20, y: 310, size: 15, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('Principal Architect', { x: 20, y: 292, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText('Creative Studio Labs', { x: 20, y: 274, size: 11, font: boldFont, color: rgb(0.85, 0.25, 0.2) });

    page.drawText('Mob: +44 20 7946 0991', { x: 20, y: 230, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Work: +44 161 496 0123', { x: 20, y: 212, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Email: oliver@creativestudio.example.com', { x: 20, y: 194, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('https://creativestudio.example.com', { x: 20, y: 176, size: 8, font, color: rgb(0.2, 0.2, 0.2) });

    page.drawText('10 Downing Way, London, UK', { x: 20, y: 130, size: 8, font, color: rgb(0.4, 0.4, 0.4) });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'business-card-vertical.pdf'), bytes);
    console.log('Created business-card-vertical.pdf');
  }

  // 3. Webinar Schedule
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    page.drawText('AI Microservices Architecture Webinar', { x: 30, y: 350, size: 18, font: boldFont, color: rgb(0.1, 0.2, 0.5) });
    page.drawText('Date: 2026-11-15', { x: 30, y: 310, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Time: 14:00 - 15:30', { x: 30, y: 285, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Location: Virtual Conference Room Alpha', { x: 30, y: 260, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Join Zoom Meeting: https://zoom.us/j/9876543210?pwd=test', { x: 30, y: 235, size: 11, font, color: rgb(0.1, 0.3, 0.8) });
    page.drawText('Description: Deep dive into microservices scalability and event streaming.', { x: 30, y: 200, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'webinar-schedule.pdf'), bytes);
    console.log('Created webinar-schedule.pdf');
  }

  // 4. Conference Schedule
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    page.drawText('Annual Tech Conclave 2026', { x: 30, y: 350, size: 18, font: boldFont, color: rgb(0.2, 0.4, 0.2) });
    page.drawText('Venue: Grand Ballroom, Convention Center', { x: 30, y: 310, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Date: 25-11-2026', { x: 30, y: 285, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Time: 09:30 AM to 11:00 AM', { x: 30, y: 260, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('https://meet.google.com/tech-conclave-2026', { x: 30, y: 235, size: 11, font, color: rgb(0.1, 0.3, 0.8) });
    page.drawText('Opening keynote followed by technical paper presentations.', { x: 30, y: 200, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'conference-schedule.pdf'), bytes);
    console.log('Created conference-schedule.pdf');
  }

  // 5. Ambiguous Date Document
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    page.drawText('Global Leadership Strategic Review', { x: 30, y: 350, size: 18, font: boldFont, color: rgb(0.3, 0.1, 0.4) });
    page.drawText('Meeting is scheduled on 05/06/2026', { x: 30, y: 310, size: 13, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Time: 10:00 AM - 11:30 AM', { x: 30, y: 285, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Location: Singapore HQ Executive Boardroom', { x: 30, y: 260, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('https://teams.microsoft.com/l/meetup-join/123456789', { x: 30, y: 235, size: 11, font, color: rgb(0.1, 0.3, 0.8) });
    page.drawText('Reviewing regional expansion plans and budget approvals.', { x: 30, y: 200, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'ambiguous-date.pdf'), bytes);
    console.log('Created ambiguous-date.pdf');
  }

  console.log('All fixtures generated successfully!');
}

generateAll().catch(err => {
  console.error(err);
  process.exit(1);
});
