// Normalize the two software example labels before the main services patch.
{
  const servicesPath = "src/components/ServicesSection.js";
  let source = read(servicesPath);

  source = replaceOnce(
    source,
    "                  View live example: Spectrafy",
    "                  Open Spectrafy",
    "Spectrafy example label",
  );
  source = replaceOnce(
    source,
    "                  View live example: CreatorOS",
    "                  Open CreatorOS",
    "CreatorOS example label",
  );

  write(servicesPath, source);
}
