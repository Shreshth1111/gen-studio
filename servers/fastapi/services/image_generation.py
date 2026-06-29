"""
═══════════════════════════════════════════════════════════════════════════════
 image_generation.py — AI IMAGE GENERATION (pluggable backends)
═══════════════════════════════════════════════════════════════════════════════

WHAT THIS FILE DOES
  ImageGenerationService.generate(prompt, image_id, width, height,
  progress_callback) produces a PNG at app_data/images/<image_id>.png and
  reports 0→100% progress via the callback (which the pipeline forwards as SSE
  `image_progress` events).

BACKEND SELECTION (by .env flag, first match wins)
  1. DALL·E          USE_DALLE=true + OPENAI_API_KEY   → OpenAI Images API
  2. Local SDXL      USE_LOCAL_SDXL=true               → SDXL-Lightning on GPU
                                                          (diffusers, 4-step)
  3. ComfyUI         USE_COMFYUI=true                  → ComfyUI workflow API
  4. Placeholder     (always available)                → a prompt-hashed gradient
                                                          PNG via Pillow, so the
                                                          app never hard-fails.
  Any backend error falls back to the placeholder.

USED BY: presentation_builder (slide images), slides.py (regenerate-image),
         studio/endpoints.py (Image Studio), images.py (/images/generate).
═══════════════════════════════════════════════════════════════════════════════
"""
import asyncio
import os
import hashlib
from pathlib import Path
from typing import Optional, Callable
import aiohttp


class ImageGenerationService:
    def __init__(self):
        self.output_dir = Path(os.getenv("APP_DATA_DIR", "./app_data")) / "images"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.use_comfyui = os.getenv("USE_COMFYUI", "false").lower() == "true"
        self.comfyui_url = os.getenv("COMFYUI_URL", "http://localhost:8188")
        self.use_dalle = os.getenv("USE_DALLE", "false").lower() == "true"
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.use_local_sdxl = os.getenv("USE_LOCAL_SDXL", "false").lower() == "true"
        self._pipe = None
        self._lock = asyncio.Lock()

    async def generate(
        self,
        prompt: str,
        image_id: str,
        width: int = 768,
        height: int = 512,
        progress_callback: Optional[Callable] = None
    ) -> Optional[str]:
        """Generate an image and return its local file path."""
        img_path = self.output_dir / f"{image_id}.png"

        if progress_callback:
            await progress_callback(10)

        try:
            if self.use_dalle and self.openai_api_key:
                return await self._generate_dalle(prompt, image_id, progress_callback)
            elif self.use_local_sdxl:
                return await self._generate_local_sdxl(prompt, image_id, width, height, progress_callback)
            elif self.use_comfyui:
                return await self._generate_comfyui(prompt, image_id, width, height, progress_callback)
            else:
                return await self._generate_placeholder(prompt, image_id, width, height, progress_callback)
        except Exception as e:
            print(f"Image generation failed: {e}")
            return await self._generate_placeholder(prompt, image_id, width, height, progress_callback)

    async def _generate_dalle(self, prompt: str, image_id: str, progress_callback=None) -> str:
        """Generate via OpenAI DALL-E."""
        import openai
        client = openai.AsyncOpenAI(api_key=self.openai_api_key)
        if progress_callback:
            await progress_callback(30)

        response = await client.images.generate(
            model="dall-e-3",
            prompt=prompt[:1000],
            size="1024x1024",
            quality="standard",
            n=1,
        )
        if progress_callback:
            await progress_callback(80)

        image_url = response.data[0].url
        # Download the image
        img_path = self.output_dir / f"{image_id}.png"
        async with aiohttp.ClientSession() as session:
            async with session.get(image_url) as resp:
                img_path.write_bytes(await resp.read())

        if progress_callback:
            await progress_callback(100)
        return str(img_path)

    async def _generate_comfyui(self, prompt, image_id, width, height, progress_callback=None) -> str:
        """Generate via ComfyUI API."""
        workflow = self._build_sdxl_workflow(prompt, width, height)
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.comfyui_url}/prompt", json={"prompt": workflow}) as r:
                result = await r.json()
                prompt_id = result["prompt_id"]
            if progress_callback:
                await progress_callback(20)

            for _ in range(120):  # 2 minutes max
                await asyncio.sleep(1.0)
                async with session.get(f"{self.comfyui_url}/history/{prompt_id}") as r:
                    history = await r.json()
                    if prompt_id in history:
                        output = history[prompt_id].get("outputs", {})
                        if output:
                            filename = list(output.values())[0]["images"][0]["filename"]
                            img_path = self.output_dir / f"{image_id}.png"
                            async with session.get(
                                f"{self.comfyui_url}/view?filename={filename}"
                            ) as img_r:
                                img_path.write_bytes(await img_r.read())
                            if progress_callback:
                                await progress_callback(100)
                            return str(img_path)

        raise TimeoutError("ComfyUI generation timed out")

    async def _generate_placeholder(self, prompt, image_id, width, height, progress_callback=None) -> str:
        """Generate a gradient placeholder image using only stdlib."""
        img_path = self.output_dir / f"{image_id}.png"

        # Simulate progress
        for pct in [20, 50, 80, 100]:
            if progress_callback:
                await progress_callback(pct)
            await asyncio.sleep(0.3)

        # Generate a color based on prompt hash
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()
        r = int(prompt_hash[0:2], 16)
        g = int(prompt_hash[2:4], 16)
        b = int(prompt_hash[4:6], 16)

        # Create simple PNG using Pillow if available, else write minimal PNG
        try:
            from PIL import Image, ImageDraw, ImageFont
            img = Image.new('RGB', (width, height), color=(r, g, b))
            draw = ImageDraw.Draw(img)
            # Draw gradient-like bars
            for i in range(0, height, 40):
                alpha = int(255 * (1 - i / height) * 0.3)
                draw.rectangle([0, i, width, i+20], fill=(
                    min(255, r + 40), min(255, g + 40), min(255, b + 40)
                ))
            # Add topic text
            words = prompt.split()[:6]
            text = " ".join(words)
            draw.text((width//2 - 10, height//2), text, fill=(255, 255, 255))
            img.save(str(img_path), 'PNG')
        except ImportError:
            # Write a minimal valid PNG (1x1 pixel scaled)
            import struct
            import zlib

            def create_png(width, height, r, g, b):
                def chunk(name, data):
                    c = struct.pack('>I', len(data)) + name + data
                    crc = struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)
                    return c + crc

                raw = b'\x00' + bytes([r, g, b] * width)
                raw = raw * height
                compressed = zlib.compress(raw)

                png = b'\x89PNG\r\n\x1a\n'
                png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
                png += chunk(b'IDAT', compressed)
                png += chunk(b'IEND', b'')
                return png

            img_path.write_bytes(create_png(width, height, r, g, b))

        return str(img_path)

    def _build_sdxl_workflow(self, prompt: str, width: int, height: int) -> dict:
        return {
            "4": {"class_type": "CheckpointLoaderSimple",
                  "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
            "5": {"class_type": "LoraLoader",
                  "inputs": {"model": ["4", 0], "clip": ["4", 1],
                             "lora_name": "sdxl_lightning_4step_lora.safetensors",
                             "strength_model": 1.0, "strength_clip": 1.0}},
            "6": {"class_type": "CLIPTextEncode",
                  "inputs": {"text": prompt, "clip": ["5", 1]}},
            "7": {"class_type": "CLIPTextEncode",
                  "inputs": {"text": "blurry, low quality, watermark, text", "clip": ["5", 1]}},
            "8": {"class_type": "KSampler",
                  "inputs": {"model": ["5", 0], "positive": ["6", 0], "negative": ["7", 0],
                             "latent_image": ["9", 0], "sampler_name": "dpmpp_sde",
                             "scheduler": "karras", "steps": 4, "cfg": 2.0, "denoise": 1.0,
                             "seed": -1}},
            "9": {"class_type": "EmptyLatentImage",
                  "inputs": {"width": width, "height": height, "batch_size": 1}},
            "10": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["4", 2]}},
            "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "ppt_"}},
        }

    async def _generate_local_sdxl(self, prompt, image_id, width, height, progress_callback=None) -> str:
        """Generate via local SDXL Lightning using diffusers."""
        import torch
        from diffusers import StableDiffusionXLPipeline, UNet2DConditionModel, EulerDiscreteScheduler
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file

        # Resolve device once per call so the cleanup branch in `finally` can
        # reach it whether or not the pipeline still needed loading.
        device = "cuda" if torch.cuda.is_available() else "cpu"

        async with self._lock:
            if self._pipe is None:
                if progress_callback:
                    await progress_callback(20)

                base = "stabilityai/stable-diffusion-xl-base-1.0"
                repo = "ByteDance/SDXL-Lightning"
                ckpt = "sdxl_lightning_4step_unet.safetensors"

                dtype = torch.float16 if device == "cuda" else torch.float32
                
                print(f"Loading SDXL Lightning model on {device}...")
                
                # Clear cache before loading heavy models
                if device == "cuda":
                    torch.cuda.empty_cache()

                # Load pipeline with basic components first
                pipe_kwargs = {
                    "torch_dtype": dtype,
                    "use_safetensors": True,
                }
                if device == "cuda":
                    pipe_kwargs["variant"] = "fp16"

                try:
                    print(f"Loading SDXL Base model on {device}...")
                    self._pipe = StableDiffusionXLPipeline.from_pretrained(
                        base, **pipe_kwargs
                    )
                    
                    # Load the Lightning LoRA weights BEFORE offloading
                    print(f"Applying lightning LoRA weights...")
                    self._pipe.load_lora_weights(
                        repo, 
                        weight_name=ckpt.replace("_unet", "_lora") if "_unet" in ckpt else "sdxl_lightning_4step_lora.safetensors"
                    )
                    self._pipe.fuse_lora()
                    
                    self._pipe.scheduler = EulerDiscreteScheduler.from_config(
                        self._pipe.scheduler.config, timestep_spacing="trailing"
                    )
                    
                    # VRAM optimizations - Sequential offload is more aggressive than model offload
                    if device == "cuda":
                        print("Enabling sequential CPU offload for maximum VRAM efficiency...")
                        self._pipe.enable_sequential_cpu_offload()
                        self._pipe.enable_attention_slicing()
                        try:
                            self._pipe.enable_vae_tiling()
                        except Exception:
                            pass
                    else:
                        self._pipe.to(device)
                except Exception as e:
                    print(f"Failed to initialize pipeline: {e}")
                    self._pipe = None
                    if device == "cuda":
                        torch.cuda.empty_cache()
                    raise e

            if progress_callback:
                await progress_callback(50)

            # Generate in a separate thread to avoid blocking the event loop
            try:
                def _run_gen():
                    return self._pipe(
                        prompt, 
                        num_inference_steps=4, 
                        guidance_scale=0.0,
                        width=width,
                        height=height
                    ).images[0]

                image = await asyncio.to_thread(_run_gen)
            finally:
                if device == "cuda":
                    torch.cuda.empty_cache()
        
        if progress_callback:
            await progress_callback(90)

        img_path = self.output_dir / f"{image_id}.png"
        image.save(str(img_path))

        if progress_callback:
            await progress_callback(100)

        return str(img_path)


image_service = ImageGenerationService()
