const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const all = await prisma.trade.findMany();
  console.log('All trades:', all.length);
  const closed = all.filter(t => t.status !== 'live_open');
  console.log('Closed trades:', closed.length);
  const orphans = all.filter(t => t.orphanedFromDb);
  console.log('Orphans:', orphans.length);
}
main().finally(() => prisma.$disconnect());
