export function normalizeCarouselImages(
  images: string[] | undefined,
): string[] {
  if (images === undefined) return [];
  return [
    ...new Set(
      images.map((image) => image.trim()).filter((image) => image.length > 0),
    ),
  ];
}
