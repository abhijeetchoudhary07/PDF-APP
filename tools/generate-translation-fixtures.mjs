import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('e2e/test-data/translation-reader');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function createEnglishContract() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Page 1
  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawText('MASTER SERVICES AND SOFTWARE LICENSE AGREEMENT', {
    x: 50,
    y: 780,
    size: 14,
    font: boldFont,
    color: rgb(0.1, 0.2, 0.4)
  });
  p1.drawText('Section 1: Parties and Purpose', {
    x: 50,
    y: 740,
    size: 12,
    font: boldFont
  });
  p1.drawText('This Master Services Agreement is entered into by and between Enterprise Solutions Corp and Client Ltd.', {
    x: 50,
    y: 715,
    size: 10,
    font
  });
  p1.drawText('The purpose of this agreement is to establish the legal framework for cloud infrastructure management.', {
    x: 50,
    y: 695,
    size: 10,
    font
  });
  p1.drawText('Section 2: Payment and Invoicing Terms', {
    x: 50,
    y: 660,
    size: 12,
    font: boldFont
  });
  p1.drawText('Invoices shall be issued on the first business day of each calendar month and must be settled within 30 days.', {
    x: 50,
    y: 635,
    size: 10,
    font
  });
  p1.drawText('Late payments shall accrue interest at the statutory rate of 1.5% per month or the legal maximum.', {
    x: 50,
    y: 615,
    size: 10,
    font
  });

  // Page 2
  const p2 = doc.addPage([595.28, 841.89]);
  p2.drawText('Section 3: Confidentiality and Data Protection', {
    x: 50,
    y: 780,
    size: 12,
    font: boldFont
  });
  p2.drawText('Each receiving party agrees to safeguard confidential proprietary data against unauthorized disclosure.', {
    x: 50,
    y: 755,
    size: 10,
    font
  });
  p2.drawText('Both parties shall comply strictly with applicable data privacy laws, security protocols, and audit controls.', {
    x: 50,
    y: 735,
    size: 10,
    font
  });
  p2.drawText('Section 4: Termination and Governing Law', {
    x: 50,
    y: 695,
    size: 12,
    font: boldFont
  });
  p2.drawText('Either party may terminate this agreement with 60 days prior written notice for convenience.', {
    x: 50,
    y: 670,
    size: 10,
    font
  });
  p2.drawText('Conclusion: This contract constitutes the entire understanding between the signatories.', {
    x: 50,
    y: 635,
    size: 11,
    font: boldFont
  });

  const bytes = await doc.save();
  const filePath = path.join(outDir, 'english-contract.pdf');
  fs.writeFileSync(filePath, bytes);
  console.log('Created:', filePath);
}

async function createSpanishManual() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Page 1
  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawText('MANUAL DE OPERACION Y MANTENIMIENTO INDUSTRIAL', {
    x: 50,
    y: 780,
    size: 14,
    font: boldFont,
    color: rgb(0.15, 0.3, 0.5)
  });
  p1.drawText('Capitulo 1: Normas de Seguridad y Precauciones Generales', {
    x: 50,
    y: 740,
    size: 12,
    font: boldFont
  });
  p1.drawText('Antes de operar la maquinaria industrial, el operador debe verificar las conexiones electricas y los frenos.', {
    x: 50,
    y: 715,
    size: 10,
    font
  });
  p1.drawText('Es obligatorio el uso de equipo de proteccion personal incluyendo casco, gafas protectoras y guantes aislantes.', {
    x: 50,
    y: 695,
    size: 10,
    font
  });

  // Page 2
  const p2 = doc.addPage([595.28, 841.89]);
  p2.drawText('Capitulo 2: Procedimiento de Calibracion y Encendido', {
    x: 50,
    y: 780,
    size: 12,
    font: boldFont
  });
  p2.drawText('Paso 1: Presione el interruptor principal de encendido ubicado en el panel frontal derecho.', {
    x: 50,
    y: 755,
    size: 10,
    font
  });
  p2.drawText('Paso 2: Ajuste la presion hidraulica al nivel recomendado entre cuatro y seis bares segun el protocolo.', {
    x: 50,
    y: 735,
    size: 10,
    font
  });
  p2.drawText('Conclusion: El mantenimiento preventivo mensual garantiza un rendimiento optimo y seguro.', {
    x: 50,
    y: 695,
    size: 11,
    font: boldFont
  });

  const bytes = await doc.save();
  const filePath = path.join(outDir, 'spanish-manual.pdf');
  fs.writeFileSync(filePath, bytes);
  console.log('Created:', filePath);
}

async function createTechnicalReport10Pages() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const sections = [
    { title: 'Executive Architecture Overview', desc: 'Overview of enterprise hybrid multi-cloud deployment with zero-trust network topology.' },
    { title: 'Kubernetes Cluster Provisioning', desc: 'Automated provisioning of production clusters using infrastructure-as-code blueprints.' },
    { title: 'High Availability and Failover', desc: 'Multi-region active-active database replication with automated health checks and failover.' },
    { title: 'Storage and Persistent Volumes', desc: 'Ceph distributed block storage paired with NVMe local caches for sub-millisecond latency.' },
    { title: 'Identity and Access Management', desc: 'OpenID Connect identity federation integrated with granular role-based access control policies.' },
    { title: 'Network Security and Micro-segmentation', desc: 'Mutual TLS encryption enforcement using service mesh sidecars across all microservices.' },
    { title: 'Telemetry and Distributed Tracing', desc: 'OpenTelemetry instrumentation piping traces, metrics, and logs to real-time analytics dashboards.' },
    { title: 'Disaster Recovery and RPO SLA', desc: 'Recovery Point Objective under 60 seconds with continuous incremental transactional log shipping.' },
    { title: 'Security Incident Response Protocol', desc: 'Automated isolation of compromised pods and security orchestration workflows for incident containment.' },
    { title: 'Audit Verification and Compliance Sign-Off', desc: 'Formal SOC2 Type II and ISO 27001 regulatory compliance verification and executive approval.' }
  ];

  for (let i = 0; i < 10; i++) {
    const page = doc.addPage([595.28, 841.89]);
    const sec = sections[i];

    page.drawText(`Cloud Enterprise Architecture Report — Page ${i + 1} of 10`, {
      x: 50,
      y: 780,
      size: 14,
      font: boldFont,
      color: rgb(0.1, 0.25, 0.45)
    });

    page.drawText(`Section ${i + 1}: ${sec.title}`, {
      x: 50,
      y: 740,
      size: 12,
      font: boldFont
    });

    page.drawText(sec.desc, {
      x: 50,
      y: 715,
      size: 10,
      font
    });

    page.drawText(`Technical specification paragraph 1 for page ${i + 1}: Detailed operational metrics and system configuration guidelines.`, {
      x: 50,
      y: 685,
      size: 9.5,
      font
    });

    page.drawText(`Technical specification paragraph 2 for page ${i + 1}: Verification standards, security assertions, and engineering guidelines.`, {
      x: 50,
      y: 660,
      size: 9.5,
      font
    });

    page.drawText(`Page ${i + 1} System Status: Operational and compliant with benchmark standards.`, {
      x: 50,
      y: 630,
      size: 9.5,
      font: boldFont,
      color: rgb(0.2, 0.4, 0.2)
    });
  }

  const bytes = await doc.save();
  const filePath = path.join(outDir, 'technical-report-10p.pdf');
  fs.writeFileSync(filePath, bytes);
  console.log('Created:', filePath);
}

async function main() {
  await createEnglishContract();
  await createSpanishManual();
  await createTechnicalReport10Pages();
  console.log('All fixtures generated successfully.');
}

main().catch(console.error);
