import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ItemImage } from "@/components/items/item-image";

describe("ItemImage", () => {
  it("renders the image when a source is available", () => {
    render(<ItemImage src="/photo.jpg" alt="Black backpack" type="FOUND" />);
    const image = screen.getByRole("img", { name: "Black backpack" });
    expect(image).toHaveAttribute("src", "/photo.jpg");
  });

  it("falls back to a labeled placeholder after an image error", () => {
    render(<ItemImage src="/broken.jpg" alt="Black backpack" type="FOUND" category="Bags" />);
    fireEvent.error(screen.getByRole("img", { name: "Black backpack" }));
    expect(screen.getByRole("img", { name: "Black backpack" })).toHaveClass("bg-paper-deep");
    expect(screen.getByText("Bags")).toBeInTheDocument();
  });

  it("renders the no-photo state without a source", () => {
    render(<ItemImage alt="Unknown item" />);
    expect(screen.getByRole("img", { name: "Unknown item" })).toBeInTheDocument();
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });

  it("clears the failure state when the source changes", () => {
    const { rerender } = render(<ItemImage src="/broken.jpg" alt="Black backpack" type="FOUND" />);
    fireEvent.error(screen.getByRole("img", { name: "Black backpack" }));
    rerender(<ItemImage src="/working.jpg" alt="Black backpack" type="FOUND" />);
    expect(screen.getByRole("img", { name: "Black backpack" })).toHaveAttribute(
      "src",
      "/working.jpg",
    );
  });
});
