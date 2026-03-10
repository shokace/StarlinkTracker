import { Meteor } from "meteor/meteor";
import { DDPRateLimiter } from "meteor/ddp-rate-limiter";
import { Match, check } from "meteor/check";
import { refreshStarlinkCatalog } from "/imports/api/satellites/server/ingest";
import { validateNoradId } from "/imports/api/satellites/validation";

Meteor.methods({
  async "satellites.refreshNow"() {
    return refreshStarlinkCatalog({ trigger: "manual-method" });
  },

  "satellites.toggleFavorite"(payload) {
    check(
      payload,
      Match.ObjectIncluding({
        noradId: Match.Integer,
        isFavorite: Boolean,
      }),
    );
    validateNoradId(payload.noradId);

    return {
      mode: this.userId ? "account-backed" : "local-only",
      noradId: payload.noradId,
      isFavorite: payload.isFavorite,
    };
  },
});

DDPRateLimiter.addRule(
  {
    type: "method",
    name: "satellites.refreshNow",
    userId() {
      return true;
    },
  },
  3,
  60 * 1000,
);

DDPRateLimiter.addRule(
  {
    type: "method",
    name: "satellites.toggleFavorite",
    userId() {
      return true;
    },
  },
  120,
  60 * 1000,
);
