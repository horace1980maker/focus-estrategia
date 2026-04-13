import { seedHardeningFixtures } from "../src/lib/hardening-fixtures";

async function main() {
  const result = await seedHardeningFixtures();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
