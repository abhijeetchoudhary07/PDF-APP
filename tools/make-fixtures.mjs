import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Generate Portrait
  const portraitBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 750;
    const ctx = canvas.getContext('2d');

    // Background (clean studio off-white)
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, 600, 750);

    // Shoulders / Suit jacket
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(300, 780, 260, 220, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shirt collar
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(250, 560);
    ctx.lineTo(300, 640);
    ctx.lineTo(350, 560);
    ctx.closePath();
    ctx.fill();

    // Neck
    ctx.fillStyle = '#fbcfe8';
    ctx.fillRect(260, 480, 80, 90);

    // Face oval
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.ellipse(300, 350, 140, 180, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(300, 260, 145, Math.PI, 0, false);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(250, 330, 22, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(350, 330, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(250, 330, 9, 0, Math.PI * 2);
    ctx.arc(350, 330, 9, 0, Math.PI * 2);
    ctx.fill();

    // Eyebrows
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(250, 310, 25, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(350, 310, 25, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // Nose
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(300, 340);
    ctx.lineTo(295, 385);
    ctx.lineTo(308, 385);
    ctx.stroke();

    // Smile
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(300, 415, 35, 0.2, Math.PI - 0.2);
    ctx.stroke();

    return canvas.toDataURL('image/png').split(',')[1];
  });

  // 2. Generate Signature
  const signatureBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    // Clean white paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 600, 300);

    // Blue ink pen strokes
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(80, 180);
    ctx.bezierCurveTo(120, 100, 160, 60, 180, 160);
    ctx.bezierCurveTo(200, 220, 240, 140, 270, 130);
    ctx.bezierCurveTo(300, 120, 320, 200, 360, 160);
    ctx.bezierCurveTo(400, 120, 440, 130, 480, 150);
    ctx.stroke();

    // Underline flourish
    ctx.beginPath();
    ctx.moveTo(120, 210);
    ctx.quadraticCurveTo(320, 240, 520, 190);
    ctx.stroke();

    return canvas.toDataURL('image/png').split(',')[1];
  });

  // 3. Generate Document Text
  const documentBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');

    // Paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 700, 900);

    // Header
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('GOVERNMENT OF INDIA', 160, 100);

    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#4338ca';
    ctx.fillText('IDENTITY VERIFICATION CERTIFICATE', 140, 140);

    // Divider line
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 165);
    ctx.lineTo(640, 165);
    ctx.stroke();

    // Body Text Lines
    ctx.fillStyle = '#334155';
    ctx.font = '16px sans-serif';
    ctx.fillText('This document certifies that the individual named below is verified.', 60, 220);
    ctx.fillText('Reference ID: IFH-2026-X89234', 60, 260);
    ctx.fillText('Issuing Authority: Department of Document Verification', 60, 300);
    ctx.fillText('Valid Nationwide for Electronic Portal Applications.', 60, 340);

    // Form fields box
    ctx.strokeRect(60, 380, 580, 280);
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Applicant Details & Biometrics', 80, 420);
    ctx.font = '14px sans-serif';
    ctx.fillText('Full Legal Name: R. K. Sharma', 80, 460);
    ctx.fillText('Date of Birth: 15/08/1992', 80, 500);
    ctx.fillText('Document Category: Category A - Primary Identification', 80, 540);
    ctx.fillText('Verification Status: Certified On-Device', 80, 580);

    return canvas.toDataURL('image/png').split(',')[1];
  });

  await browser.close();

  fs.writeFileSync('e2e/test-data/photos/portrait-person.png', Buffer.from(portraitBase64, 'base64'));
  fs.writeFileSync('e2e/test-data/signatures/signature-ink.png', Buffer.from(signatureBase64, 'base64'));
  fs.writeFileSync('e2e/test-data/scanner/document-scan.png', Buffer.from(documentBase64, 'base64'));
  console.log('Test fixtures generated successfully!');
}

main().catch(console.error);
