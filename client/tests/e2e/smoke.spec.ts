import { expect, type Page, test } from "@playwright/test";

const item = {
  id: "7bab6688-6681-50ed-99aa-58afaaaa9cfc",
  title: "Student ID card - Nina A.",
  description: "White student ID card with a blue lanyard.",
  category: "Cards & IDs",
  brand: null,
  color: "White",
  location: "Dining Hall - Front desk",
  occurred_at: "2026-10-25T02:28:37.133932Z",
  type: "FOUND",
  status: "OPEN",
  processing_status: "READY",
  is_owner: false,
  created_at: "2026-10-25T04:28:37.133932Z",
  updated_at: "2026-10-25T04:40:37.133932Z",
  images: [],
};

async function mockPublicApi(page: Page) {
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Not authenticated" }),
    }),
  );
  await page.route("**/api/v1/items**", (route) => {
    const pageSize = new URL(route.request().url()).searchParams.get("page_size");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [item],
        total: 1,
        page: 1,
        page_size: pageSize === "1" ? 1 : 8,
        pages: 1,
      }),
    });
  });
}

test("renders the public discovery board", async ({ page }) => {
  await mockPublicApi(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lost something?");
  await expect(
    page.getByRole("link", { name: /Student ID card - Nina A\./ }).first(),
  ).toBeVisible();
  await expect(page.getByText("1 report on the board")).toBeVisible();
});

test("redirects protected routes to login with a return path", async ({ page }) => {
  await mockPublicApi(page);
  await page.goto("/my/reports");

  await expect(page).toHaveURL(/\/login\?redirect=%2Fmy%2Freports/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("validates the login form before submitting", async ({ page }) => {
  await mockPublicApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
});
