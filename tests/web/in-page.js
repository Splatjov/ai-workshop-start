// What the tests run inside the page. Plain JavaScript: these functions are sent to the browser, and
// its types (the DOM) are not this project's.

/**
 * What is drawn on the sky, read in the frame it was drawn in: how many pixels are in the pen's
 * colour, how many in the accent's (the red pencil by day, gold by night) and how many in the
 * wash's (the marker's, over the lands); how light the pen is (0 to 255); and the sum of everything
 * drawn, which is the same for the same drawing.
 * @returns {Promise<{ inked: number, accented: number, washed: number, tone: number, weight: number }>}
 */
export function ink() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => {
      const drawn = document.querySelector('canvas.sky');
      const copy = document.createElement('canvas');
      copy.width = drawn.width;
      copy.height = drawn.height;
      const context = copy.getContext('2d', { willReadFrequently: true });

      // The page's own colours, whatever their notation: a canvas reads them.
      const style = getComputedStyle(document.documentElement);
      const colours = ['--ink', '--accent', '--marker'].map((name) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = style.getPropertyValue(name).trim();
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data;
      });
      context.clearRect(0, 0, 1, 1);

      context.drawImage(drawn, 0, 0);
      const { data } = context.getImageData(0, 0, copy.width, copy.height);
      const counts = [0, 0, 0];
      let light = 0;
      let weight = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] <= 48) continue;
        weight += data[i + 3];
        let nearest = 0;
        let least = Infinity;
        for (let c = 0; c < 3; c++) {
          const away = (data[i] - colours[c][0]) ** 2 + (data[i + 1] - colours[c][1]) ** 2 + (data[i + 2] - colours[c][2]) ** 2;
          if (away < least) [least, nearest] = [away, c];
        }
        counts[nearest]++;
        if (nearest === 0) light += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      resolve({ inked: counts[0], accented: counts[1], washed: counts[2], tone: counts[0] ? light / counts[0] : 0, weight });
    }),
  );
}

/**
 * The names of the places that are in plain view: on the near side of the world, inside the sky's
 * place on the page, their names fully shown.
 * @returns {string[]}
 */
export function placesInView() {
  const slot = document.querySelector('.globe').getBoundingClientRect();
  return [...document.querySelectorAll('[data-place]')]
    .filter((place) => {
      const at = place.getBoundingClientRect();
      const inside = at.x > slot.left + 30 && at.x < slot.right - 30 && at.y > slot.top + 30 && at.y < slot.bottom - 30;
      return inside && Number(getComputedStyle(place).opacity) > 0.9;
    })
    .map((place) => place.textContent);
}

/** A browser without WebGL: a canvas gives no such context. */
export function withoutWebGL() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    return String(kind).startsWith('webgl') ? null : getContext.call(this, kind, ...rest);
  };
}
