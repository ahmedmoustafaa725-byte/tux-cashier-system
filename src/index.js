import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Admin from "./Admin";

const root = ReactDOM.createRoot(document.getElementById("root"));
const path = window.location.pathname.toLowerCase();
root.render(path.startsWith("/admin") ? <Admin /> : <App />);
