import type { LoaderFunction } from "@remix-run/node";

export const loader: LoaderFunction = async () => {
  const js = `
    console.log("✅ Script is running");
    const banner = document.createElement('div');
    banner.innerText = 'This is the compliance script banner!';
    banner.style.position = 'fixed';
    banner.style.bottom = '20px';
    banner.style.left = '20px';
    banner.style.background = '#000';
    banner.style.color = '#fff';
    banner.style.padding = '10px';
    banner.style.borderRadius = '5px';
    banner.style.zIndex = '9999';
    document.body.appendChild(banner);
  `;
  
  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript"
    }
  });
};

export default () => null;
