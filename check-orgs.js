const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.organization.findMany().then(orgs => console.log(JSON.stringify(orgs, null, 2))).catch(console.error).finally(() => prisma.$disconnect());
