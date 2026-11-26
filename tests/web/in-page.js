// What the tests run inside the page. Plain JavaScript: these functions are sent to the browser, and
// its types (the DOM) are not this project's.

/**
 * What is drawn on the sky, read in the frame it was drawn in: how many pixels are inked in the
 * pen's colour and how many in the accent's (the red pencil by day, gold by night), how light the
 * pen is (0 to 255), and the sum of all the ink, which is the same for the same drawing.
 * @returns {Promise<{ inked: number, accented: number, tone: number, weight: number }>}
 */
export function ink() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => {
      const drawn = document.querySelector('canvas.sky');
      const copy = document.createElement('canvas');
      copy.width = drawn.width;
      copy.height = drawn.height;
      const context = copy.getContext('2d');
      context.drawImage(drawn, 0, 0);
      const { data } = context.getImageData(0, 0, copy.width, copy.height);
      let inked = 0;
      let accented = 0;
      let light = 0;
      let weight = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] <= 48) continue;
        weight += data[i + 3];
        if (data[i] - data[i + 2] > 80) {
          accented++;
        } else {
          inked++;
          light += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
      }
      resolve({ inked, accented, tone: inked ? light / inked : 0, weight });
    }),
  );
}

/** A browser without WebGL: a canvas gives no such context. */
export function withoutWebGL() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    return String(kind).startsWith('webgl') ? null : getContext.call(this, kind, ...rest);
  };
}
