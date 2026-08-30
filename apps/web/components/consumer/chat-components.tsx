"use client";

import { useRef, useState } from "react";

import type { IntentChip, RealOffer } from "../../lib/agent-api";
import { normalizeCarouselImages } from "./carousel-utils";

export { normalizeCarouselImages } from "./carousel-utils";

/** CONSUMER_UX.md §3.8a — absent means absent, never a placeholder. */
export function ImageCarousel({
  images,
  alt,
}: {
  images?: string[];
  alt: string;
}) {
  const validImages = normalizeCarouselImages(images);
  const [activeIndex, setActiveIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  if (validImages.length === 0) return null;

  function showImage(index: number) {
    const normalizedIndex = Math.min(
      Math.max(index, 0),
      validImages.length - 1,
    );
    setActiveIndex(normalizedIndex);
    const strip = stripRef.current;
    if (strip !== null) {
      strip.scrollTo({
        left: strip.clientWidth * normalizedIndex,
        behavior: "smooth",
      });
    }
  }

  return (
    <div
      className="relative mb-3 overflow-hidden rounded-[10px]"
      data-image-count={validImages.length}
    >
      <div
        ref={stripRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          if (width > 0)
            setActiveIndex(Math.round(event.currentTarget.scrollLeft / width));
        }}
      >
        {validImages.map((src, index) => (
          // Merchant image hosts are MCP-provided at runtime, so Next/Image
          // cannot safely predeclare their remote domains.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${src}-${index}`}
            src={src}
            alt={`${alt}, image ${index + 1} of ${validImages.length}`}
            className="aspect-[16/9] w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {validImages.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() =>
              showImage(
                (activeIndex - 1 + validImages.length) % validImages.length,
              )
            }
            className="absolute left-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--ink)] shadow-sm sm:flex"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => showImage((activeIndex + 1) % validImages.length)}
            className="absolute right-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--ink)] shadow-sm sm:flex"
          >
            ›
          </button>
          <div
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5"
            aria-label={`Image ${activeIndex + 1} of ${validImages.length}`}
          >
            {validImages.map((src, index) => (
              <span
                key={`${src}-dot-${index}`}
                className={`size-1.5 rounded-full ${index === activeIndex ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3.5">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[13px] font-semibold text-[var(--gold)] ring-2 ring-[var(--blue-pale)]"
      >
        V
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold leading-tight text-[var(--ink)]">
          Yoink
        </p>
        <p className="truncate text-[12px] leading-tight text-[var(--muted)]">
          Conversational shopping, one recommendation at a time
        </p>
      </div>
    </header>
  );
}

/** CONSUMER_UX.md §3.1 */
export function WelcomeMessage({
  onPickExample,
}: {
  onPickExample: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 py-6">
      <p className="text-[15px] text-[var(--ink)]">
        Tell me what you're looking for.
      </p>
      <button
        type="button"
        onClick={() => onPickExample("Noise-cancelling headphones under $150")}
        className="w-fit rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)] shadow-[0_1px_2px_rgba(16,27,55,0.04)] transition hover:-translate-y-px hover:border-[var(--blue)] hover:text-[var(--blue)] hover:shadow-[0_6px_16px_rgba(49,87,232,0.12)]"
      >
        Try: noise-cancelling headphones under $150
      </button>
    </div>
  );
}

/** CONSUMER_UX.md §3.2 / §3.3 */
export function ChatBubble({
  role,
  error = false,
  children,
}: {
  role: "user" | "agent";
  error?: boolean;
  children: React.ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-[14px] bg-[var(--navy)] px-4 py-2.5 text-[15px] text-white">
          {children}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] rounded-r-[14px] border border-[var(--line)] border-l-[3px] border-l-[var(--caution)] bg-[var(--surface)] px-4 py-2.5 text-[15px] text-[var(--ink)] shadow-[0_1px_2px_rgba(16,27,55,0.04)]">
          <span aria-hidden="true" className="mr-2 text-[var(--caution)]">
            △
          </span>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[15px] text-[var(--ink)] shadow-[0_1px_2px_rgba(16,27,55,0.04)]">
        {children}
      </div>
    </div>
  );
}

/** CONSUMER_UX.md §3.4 */
export function DirectionCards({
  cards,
  onSelect,
}: {
  cards: Array<{
    productId: string;
    name: string;
    description: string;
    images?: string[];
  }>;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <button
          key={card.productId}
          type="button"
          onClick={() => onSelect(card.name)}
          className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[0_1px_2px_rgba(16,27,55,0.04)] transition hover:-translate-y-px hover:border-[var(--blue)] hover:shadow-[0_8px_20px_rgba(49,87,232,0.1)]"
        >
          <ImageCarousel images={card.images} alt={card.name} />
          <p className="text-sm font-medium text-[var(--ink)]">{card.name}</p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {card.description}
          </p>
        </button>
      ))}
    </div>
  );
}

/** Mode 2a: deliberately muted and structurally unlike the winner card. */
export function ProvisionalShortlist({
  items,
}: {
  items: Array<{
    productId: string;
    name: string;
    summary: string;
    images?: string[];
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className="rounded-[14px] border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-3"
      aria-label="Provisional shortlist"
    >
      <p className="mb-2 text-[12px] font-medium text-[var(--muted)]">
        A starting point, while I get more detail
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <article
            key={item.productId}
            className="min-w-[220px] flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_1px_2px_rgba(16,27,55,0.04)] sm:min-w-0"
          >
            <ImageCarousel images={item.images} alt={item.name} />
            <p className="text-[13px] font-medium text-[var(--ink)]">
              {item.name}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
              {item.summary}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/** CONSUMER_UX.md §3.5 */
export function IntentChipRow({
  chips,
  onEdit,
}: {
  chips: IntentChip[];
  onEdit: (field: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-y border-[var(--line)] py-2">
      {chips.map((chip) => (
        <button
          type="button"
          key={chip.field}
          onClick={() => onEdit(chip.field)}
          aria-label={`Edit ${chip.label}`}
          className="rounded-full border border-[var(--blue-pale)] bg-[var(--blue-pale)] px-3 py-1 text-[12px] font-medium text-[var(--blue-dark)] transition hover:border-[var(--blue)]"
        >
          {chip.label} <span aria-hidden="true">· edit</span>
        </button>
      ))}
    </div>
  );
}

/** CONSUMER_UX.md §3.6 */
export function SearchingStatus({ text }: { text: string }) {
  return <p className="py-1 text-[13px] text-[var(--muted)]">{text}</p>;
}

/** CONSUMER_UX.md §3.8 */
export function ComparisonView({
  winner,
  alternatives,
}: {
  winner: { offer: RealOffer; summary: string };
  alternatives: Array<{ offer: RealOffer; reason: string }>;
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="rounded-[14px] border-2 border-[var(--signal-gold)] bg-[var(--surface)] p-4 shadow-[0_12px_28px_rgba(169,120,47,0.12)]">
        <ImageCarousel
          images={winner.offer.images}
          alt={winner.offer.productName}
        />
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[15px] font-semibold text-[var(--ink)]">
            {winner.offer.productName}
          </p>
          <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[11px] font-medium text-white">
            Recommended
          </span>
        </div>
        <p className="text-[13px] text-[var(--muted)]">
          {winner.offer.merchantName}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-[var(--muted)]">
          {winner.summary}
        </p>
      </div>
      {alternatives.map((alt) => (
        <div
          key={alt.offer.offerId}
          className="grid gap-1 border-b border-[var(--line)] px-1 py-2 text-[13px] last:border-b-0 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-4"
        >
          <span>
            <span className="block font-medium text-[var(--ink)]">
              {alt.offer.productName}
            </span>
            <span className="block text-[12px] text-[var(--muted)]">
              {alt.offer.merchantName}
            </span>
          </span>
          <span className="leading-5 text-[var(--muted)] sm:text-right">
            {alt.reason}
          </span>
        </div>
      ))}
    </div>
  );
}

/** CONSUMER_UX.md §3.9 */
export function TransactionPreview({
  offer,
  priceChanged,
  onConfirm,
  confirming,
}: {
  offer: RealOffer;
  priceChanged: boolean;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_16px_36px_rgba(23,38,75,0.08)]">
      {priceChanged ? (
        <p className="rounded-[8px] bg-[var(--warning-pale)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--warning)]">
          Price updated — please confirm the new total.
        </p>
      ) : null}
      <p className="text-[15px] font-semibold text-[var(--ink)]">
        {offer.productName}
      </p>
      <p className="text-[13px] text-[var(--muted)]">{offer.merchantName}</p>
      <p className="border-y border-[var(--line)] py-3 font-mono text-[20px] font-semibold tabular-nums text-[var(--ink)]">
        {offer.currency} {offer.offeredPrice}
      </p>
      <p className="flex justify-between gap-4 text-[13px] text-[var(--muted)]">
        <span>Delivery / scheduling</span>
        <span className="text-right">
          {offer.deliveryEstimate !== null
            ? new Date(offer.deliveryEstimate).toLocaleDateString()
            : "Not provided"}
        </span>
      </p>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirming}
        className="mt-1 rounded-[14px] bg-[var(--navy)] px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-[var(--navy-light)] disabled:opacity-60"
      >
        {confirming ? "Authorizing purchase…" : "Confirm & authorize"}
      </button>
    </div>
  );
}

/** CONSUMER_UX.md §3.11 */
export function PaymentResultView({
  status,
  merchant,
}: {
  status: "authorized" | "declined" | "processing";
  merchant?: string;
}) {
  if (status === "authorized") {
    return (
      <p className="rounded-[10px] bg-[var(--success-pale)] px-3 py-2.5 text-[15px] font-medium text-[var(--success)]">
        Payment authorized — {merchant ?? "the merchant"} is preparing your
        order.
      </p>
    );
  }
  if (status === "declined") {
    return (
      <p className="rounded-[10px] bg-[var(--warning-pale)] px-3 py-2.5 text-[15px] font-medium text-[var(--danger)]">
        Payment declined. Try a different card or offer.
      </p>
    );
  }
  return (
    <p className="py-2 text-[15px] text-[var(--muted)]">Confirming payment…</p>
  );
}

export function ConversationDivider({
  kind,
}: {
  kind: "complete" | "new_request";
}) {
  return (
    <div
      className={`flex items-center gap-3 py-3 ${kind === "new_request" ? "opacity-70" : ""}`}
      role="separator"
    >
      <span className="h-px flex-1 bg-[var(--line)]" />
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        {kind === "complete" ? "Order confirmed" : "New request"}
      </span>
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}
