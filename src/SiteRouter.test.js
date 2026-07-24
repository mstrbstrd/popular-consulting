import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SiteRouter, { resolveSiteView } from "./SiteRouter";

jest.mock("./App", () => () => <div data-testid="immersive-site">Immersive site</div>);
jest.mock("./components/WorkPage", () => () => <div data-testid="work-page">Work page</div>);

describe("SiteRouter", () => {
  afterEach(cleanup);

  test("resolves the conventional work route with or without a trailing slash", () => {
    expect(resolveSiteView("/work")).toBe("work");
    expect(resolveSiteView("/work/")).toBe("work");
  });

  test("keeps the immersive experience as the safe default", () => {
    expect(resolveSiteView("/")).toBe("immersive");
    expect(resolveSiteView("/unknown")).toBe("immersive");
  });

  test("renders the selected work page at /work", () => {
    render(<SiteRouter pathname="/work" />);
    expect(screen.getByTestId("work-page")).toBeInTheDocument();
    expect(screen.queryByTestId("immersive-site")).not.toBeInTheDocument();
  });

  test("renders the immersive site at the root", () => {
    render(<SiteRouter pathname="/" />);
    expect(screen.getByTestId("immersive-site")).toBeInTheDocument();
    expect(screen.queryByTestId("work-page")).not.toBeInTheDocument();
  });
});
