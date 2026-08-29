async function main(): Promise<void> {
  console.log("No seed data exists yet.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
