import { createRoot } from "react-dom/client";
import { Meteor } from "meteor/meteor";
import { App } from "/imports/ui/App";
import "cesium/Build/Cesium/Widgets/widgets.css";

window.CESIUM_BASE_URL = "/cesium";

Meteor.startup(() => {
  const container = document.getElementById("react-target");
  const root = createRoot(container);
  root.render(<App />);
});
