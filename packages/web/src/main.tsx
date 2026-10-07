/**
 * The web app's entry point: the browser runs this when it loads
 * index.html. It reads this launch's token from the page, builds the API
 * client and the router, and hands the page to React.
 */
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createApiClient, readLaunchToken } from "./api/client";
import { createAppRouter } from "./router";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("index.html has no #root element.");
}

const root = createRoot(container);

/** The app, or a message saying why it cannot start. */
function start(): ReactNode {
  let token: string;
  try {
    token = readLaunchToken(document);
  } catch (error) {
    // Without the token every API call fails, so say why instead of showing
    // an app that cannot load anything.
    return <p role="alert">{(error as Error).message}</p>;
  }
  const api = createApiClient({ token });
  return <RouterProvider router={createAppRouter({ context: { api } })} />;
}

// StrictMode runs extra checks while developing (each effect twice, to
// surface missing clean-up); it does nothing in the production build.
root.render(<StrictMode>{start()}</StrictMode>);
