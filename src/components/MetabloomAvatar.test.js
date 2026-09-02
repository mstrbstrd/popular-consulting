import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MetabloomAvatar from "./MetabloomAvatar";

let mockFieldProps = null;
let mockHasHardwareWebGL = true;

jest.mock("../utils/deviceTier", () => ({
  get hasHardwareWebGL() {
    return mockHasHardwareWebGL;
  },
}));

jest.mock("./LivingMetabloomCanvas", () => {
  const ReactModule = require("react");
  return (props) => {
    mockFieldProps = props;
    return ReactModule.createElement("div", {
      "data-testid": "living-metabloom-field",
      "data-emotion-version": String(props.emotionVersion),
      "data-enabled": String(props.enabled),
      "data-expression": props.expression,
      "data-form": props.form,
      "data-paused": String(props.paused),
      "data-pulse-version": String(props.pulseVersion),
      "data-talking": String(props.talking),
    });
  };
});

describe("MetabloomAvatar", () => {
  beforeEach(() => {
    mockFieldProps = null;
    mockHasHardwareWebGL = true;
  });

  afterEach(() => {
    cleanup();
  });

  test("uses the living Metabloom field as the complete creature", () => {
    const { rerender } = render(
      <MetabloomAvatar
        emotionVersion={2}
        expression="sad"
        form="drift"
        pulseVersion={2}
        talking={false}
      />,
    );

    const avatar = screen.getByTestId("metabloom-avatar");
    expect(screen.getAllByTestId("living-metabloom-field")).toHaveLength(1);
    expect(avatar).toHaveAttribute("data-avatar-material", "living-metabloom");
    expect(avatar).toHaveAttribute("data-avatar-expression", "sad");
    expect(avatar).toHaveAttribute("data-avatar-form", "drift");
    expect(avatar.querySelector("svg")).not.toBeInTheDocument();
    expect(
      avatar.querySelector(".metabloom-avatar__body"),
    ).not.toBeInTheDocument();
    expect(
      avatar.querySelector(".metabloom-avatar__material"),
    ).not.toBeInTheDocument();

    rerender(
      <MetabloomAvatar
        emotionVersion={4}
        expression="thinking"
        form="focus"
        pulseVersion={4}
        talking
      />,
    );

    expect(screen.getAllByTestId("living-metabloom-field")).toHaveLength(1);
    expect(mockFieldProps).toMatchObject({
      emotionVersion: 4,
      enabled: true,
      expression: "thinking",
      form: "focus",
      pulseVersion: 4,
      talking: true,
    });
    expect(avatar).toHaveAttribute("data-avatar-talking", "true");
  });

  test("pauses the one field when inactive or explicitly paused", () => {
    const { rerender } = render(
      <MetabloomAvatar isActive={false} paused={false} />,
    );

    expect(mockFieldProps.paused).toBe(true);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-active",
      "false",
    );

    rerender(<MetabloomAvatar isActive paused />);
    expect(mockFieldProps.paused).toBe(true);

    rerender(<MetabloomAvatar isActive paused={false} />);
    expect(mockFieldProps.paused).toBe(false);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-active",
      "true",
    );
  });

  test("keeps keyboard and pointer pulse activation on the creature", () => {
    const onPulse = jest.fn();
    render(<MetabloomAvatar onPulse={onPulse} />);

    const avatar = screen.getByRole("button", {
      name: /activate to send a pulse through the creature/i,
    });
    fireEvent.keyDown(avatar, { key: "Enter" });
    fireEvent.keyDown(avatar, { key: " " });
    fireEvent.click(avatar);

    expect(onPulse).toHaveBeenCalledTimes(3);
  });

  test("routes every degraded session through the same complete creature component", () => {
    mockHasHardwareWebGL = false;
    const expressions = [
      "happy",
      "excited",
      "sad",
      "surprised",
      "thinking",
      "sleepy",
      "angry",
    ];
    const { rerender } = render(
      <MetabloomAvatar expression={expressions[0]} />,
    );

    expressions.forEach((expression, index) => {
      rerender(
        <MetabloomAvatar
          emotionVersion={index + 10}
          expression={expression}
          form={index % 2 === 0 ? "bloom" : "focus"}
          pulseVersion={index + 1}
          talking={index === 4}
        />,
      );
      expect(mockFieldProps.enabled).toBe(false);
      expect(mockFieldProps.emotionVersion).toBe(index + 10);
      expect(mockFieldProps.expression).toBe(expression);
      expect(mockFieldProps.form).toBe(index % 2 === 0 ? "bloom" : "focus");
      expect(mockFieldProps.pulseVersion).toBe(index + 1);
      expect(mockFieldProps.talking).toBe(index === 4);
      expect(screen.getAllByTestId("living-metabloom-field")).toHaveLength(1);
    });
  });
});
