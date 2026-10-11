import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL = process.env.SEED_EMAIL || 'mmitrran@gmail.com';
const PASSWORD = process.env.SEED_PASSWORD || 'Mitrran@27';
const NAME = process.env.SEED_NAME || 'Mitrran Menon';

async function main() {
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {}, // never overwrite an existing password
    create: {
      email: EMAIL,
      name: NAME,
      passwordHash: await bcrypt.hash(PASSWORD, 11),
      profile: {
        create: {
          fullName: NAME,
          headline: 'Computer Science graduate',
          email: EMAIL,
          location: 'Klang, Selangor',
        },
      },
      careerPlan: { create: {} },
    },
  });

  const has = async (m: any) => (await m.count({ where: { userId: user.id } })) > 0;

  if (!(await has(prisma.education))) {
    await prisma.education.createMany({
      data: [
        {
          userId: user.id, sortOrder: 0,
          institution: 'Management and Science University',
          qualification: "Bachelor's in Computer Science (Hons)",
          location: 'Shah Alam, Selangor',
          startDate: 'September 2021', endDate: 'September 2024',
          details: ['CGPA: 3.62', 'Dean’s List Award Sept 2022, Dean’s List Award Sept 2024', 'Final Year Project: Silver Medal Award'],
        },
        {
          userId: user.id, sortOrder: 1,
          institution: 'Management and Science University',
          qualification: 'Foundation in Information Technology',
          location: 'Shah Alam, Selangor',
          startDate: 'September 2020', endDate: 'September 2021',
          details: ['CGPA: 3.68', 'Dean’s List Award Sept 2020'],
        },
      ],
    });
  }
  if (!(await has(prisma.certification))) {
    await prisma.certification.createMany({
      data: [
        { userId: user.id, sortOrder: 0, title: 'Penang Digitalisation-AI Conference & Exhibition', date: 'July 2026' },
        { userId: user.id, sortOrder: 1, title: 'Dean’s List Award, Management and Science University', date: 'September 2022' },
        { userId: user.id, sortOrder: 2, title: 'Final Year Project: Silver Medal Award, Management and Science University', date: 'December 2023' },
      ],
    });
  }
  if (!(await has(prisma.publication))) {
    await prisma.publication.create({
      data: {
        userId: user.id,
        citation:
          'Beleid, N., Bakon, K. A., & Menon, M. (2024). Collaborative learning platform for academicians in Libya. AlQalam Journal of Medical and Applied Sciences, 7(3), 811–819.',
        url: 'https://doi.org/10.54361/ajmas.247351',
      },
    });
  }
  if (!(await has(prisma.reference))) {
    await prisma.reference.create({
      data: {
        userId: user.id,
        name: 'Mr. Sasitheran Pathmanathan',
        role: 'CTO and Technical Lead',
        company: 'CRE8 Iot SDN BHD',
        email: 'sasitheran@cre8iot.com',
        phone: '+60 12 674 5339',
      },
    });
  }

  console.log(`Seeded user ${EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
