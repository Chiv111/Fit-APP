const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_PDF_PAGES = 60;

let pdfJsPromise = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import("pdfjs-dist/build/pdf.mjs"),
      import("pdfjs-dist/build/pdf.worker.mjs?url"),
    ]).then(([pdfjs, workerModule]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

function groupTextItems(items) {
  const rows = [];

  items
    .filter((item) => typeof item?.str === "string" && item.str.trim())
    .forEach((item) => {
      const x = Number(item.transform?.[4]) || 0;
      const y = Number(item.transform?.[5]) || 0;
      const height = Math.max(8, Number(item.height) || Math.abs(Number(item.transform?.[3])) || 10);
      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= Math.max(2.5, height * 0.22));
      if (!row) {
        row = { y, height, items: [] };
        rows.push(row);
      }
      row.items.push({ x, width: Number(item.width) || 0, text: item.str.trim(), height });
    });

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const sorted = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let previousEnd = null;
      sorted.forEach((item) => {
        if (previousEnd !== null) {
          const gap = item.x - previousEnd;
          line += gap > Math.max(20, item.height * 1.8) ? " | " : " ";
        }
        line += item.text;
        previousEnd = Math.max(item.x, item.x + item.width);
      });
      return line.replace(/\s+/g, " ").replace(/\s*\|\s*/g, " | ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

export async function extractRoutineTextFromPdf(file, onProgress) {
  if (!file || file.type !== "application/pdf") {
    throw new Error("Selecciona un archivo PDF válido.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("El PDF es demasiado grande. El límite es 12 MB.");
  }

  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;

  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`El PDF tiene ${document.numPages} páginas. El límite es ${MAX_PDF_PAGES}.`);
    }

    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      onProgress?.({ page: pageNumber, total: document.numPages });
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = groupTextItems(content.items);
      if (pageText) pages.push(pageText);
      page.cleanup();
    }

    const text = pages.join("\n\n").trim();
    if (text.length < 20) {
      throw new Error("No encontramos texto en el PDF. Si está escaneado como imagen, crea la rutina manualmente.");
    }
    return text;
  } finally {
    document.cleanup?.();
    await loadingTask.destroy();
  }
}
