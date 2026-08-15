import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../shared/contracts";
import { TitleCard } from "./TitleCard";

const entry: CollectionEntry = {
  key: "tv:83867:1",
  mediaType: "tv",
  tmdbId: 83867,
  seasonNumber: 1,
  title: "Andor — Season 1",
  overview: "",
  releaseDate: "2022-09-21",
  releaseYear: 2022,
  posterPath: null,
  backdropPath: null,
  voteAverage: 8.2,
  formats: ["4K UHD"],
  genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
  addedAt: "2026-08-15T12:00:00.000Z",
};

describe("TitleCard", () => {
  it("links TV ownership to the exact season", () => {
    render(
      <MemoryRouter>
        <TitleCard entry={entry} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "View Andor — Season 1" })).toHaveAttribute(
      "href",
      "/title/tv/83867/season/1",
    );
    expect(screen.getByText("Season 1")).toBeInTheDocument();
    expect(screen.getByText("4K UHD")).toBeInTheDocument();
  });
});
