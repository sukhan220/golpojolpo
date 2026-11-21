"use client";

import React from "react";
import ReaderApp from "../app/reader";

export default function ReaderAppWrapper({ initialStory, onBack }) {
  return <ReaderApp initialStory={initialStory} onBack={onBack} />;
}
