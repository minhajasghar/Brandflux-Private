import httpx
from bs4 import BeautifulSoup
import re
import logging
from typing import Dict, Any, List, Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

class BrandScraper:
    def __init__(self, url: str):
        if not url.startswith("http"):
            url = "https://" + url
        self.url = url
        self.base_url = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def scrape(self) -> Dict[str, Any]:
        """Main method that calls all sub-methods. Returns complete brand data dict."""
        html = await self._fetch_html()
        if not html:
            return {"error": "Could not fetch website content"}

        soup = BeautifulSoup(html, "html.parser")
        
        # Extract text data
        text_data = self._extract_text(soup)
        logo_url = self._extract_logo(soup)
        
        # Layered Brand Color Extraction Pipeline (Playwright, CSS vars, DOM sampling, ColorThief, Gemini Vision)
        palette_data = {}
        try:
            from services.brand_color_extractor import BrandColorExtractor
            color_extractor = BrandColorExtractor(self.url)
            if logo_url:
                color_extractor.logo_url = logo_url
            palette_data = await color_extractor.extract_palette()
            if not logo_url and color_extractor.logo_url:
                logo_url = color_extractor.logo_url
        except Exception as e:
            logger.warning(f"Layered color extractor failed: {e}; falling back to static regex.")
            fallback_colors = self._extract_colors(html)
            palette_data = {
                "primary": {"hex": fallback_colors[0] if fallback_colors else "#2563EB", "confidence": 0.50, "source": "static_regex"},
                "secondary": {"hex": fallback_colors[1] if len(fallback_colors) > 1 else "#64748B", "confidence": 0.50, "source": "static_regex"},
                "accent": {"hex": fallback_colors[2] if len(fallback_colors) > 2 else "#38BDF8", "confidence": 0.50, "source": "default"},
                "neutrals": [],
                "colors": fallback_colors or ["#2563EB", "#64748B"],
                "extraction_method": "static_regex_fallback"
            }

        colors = palette_data.get("colors") or ["#2563EB", "#64748B"]
        primary_color = palette_data.get("primary", {}).get("hex") if palette_data.get("primary") else colors[0]
        secondary_color = palette_data.get("secondary", {}).get("hex") if palette_data.get("secondary") else (colors[1] if len(colors) > 1 else "#64748B")
        accent_color = palette_data.get("accent", {}).get("hex") if palette_data.get("accent") else (colors[2] if len(colors) > 2 else "#38BDF8")
        neutrals = palette_data.get("neutrals", [])
        
        # Detect brand attributes
        all_text = f"{text_data['business_name']} {text_data['tagline']} {text_data['about_text']} {' '.join(text_data['products_services'])}"
        brand_tone = self._detect_brand_tone(all_text)
        business_type = self._detect_business_type(all_text)

        return {
            "website_url": self.url,
            "business_name": text_data["business_name"],
            "tagline": text_data["tagline"],
            "about_text": text_data["about_text"],
            "products_services": text_data["products_services"],
            "contact_info": text_data["contact_info"],
            "social_links": text_data["social_links"],
            "colors": colors,
            "primary_color": primary_color,
            "secondary_color": secondary_color,
            "accent_color": accent_color,
            "neutrals": neutrals,
            "color_palette": palette_data,
            "logo_url": logo_url,
            "brand_tone": brand_tone,
            "business_type": business_type,
            "raw_text": all_text[:5000]
        }

    async def _fetch_html(self) -> Optional[str]:
        """Fetch website HTML using httpx with error handling."""
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers=self.headers) as client:
                response = await client.get(self.url)
                response.raise_for_status()
                return response.text
        except Exception as e:
            logger.error(f"Scraper error fetching {self.url}: {str(e)}")
            return None

    def _extract_text(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """Extract key textual information from the page."""
        # 1. Business Name
        business_name = ""
        title_tag = soup.find("title")
        og_site_name = soup.find("meta", property="og:site_name")
        h1_tag = soup.find("h1")
        
        if og_site_name: business_name = og_site_name.get("content", "")
        elif title_tag: business_name = title_tag.get_text().split("|")[0].split("-")[0].strip()
        elif h1_tag: business_name = h1_tag.get_text().strip()

        # 2. Tagline
        tagline = ""
        og_desc = soup.find("meta", property="og:description")
        meta_desc = soup.find("meta", attrs={"name": "description"})
        h2_tag = soup.find("h2")
        
        if og_desc: tagline = og_desc.get("content", "")
        elif meta_desc: tagline = meta_desc.get("content", "")
        elif h2_tag: tagline = h2_tag.get_text().strip()

        # 3. About Text
        about_text = ""
        about_section = soup.find(lambda tag: tag.name in ["div", "section", "p"] and 
                                 any(x in str(tag.get("class", [])).lower() or x in str(tag.get("id", "")).lower() 
                                     for x in ["about", "story", "mission"]))
        if about_section:
            about_text = about_section.get_text().strip()[:1000]

        # 4. Products/Services
        products = []
        # From nav links
        nav = soup.find("nav")
        if nav:
            for a in nav.find_all("a"):
                text = a.get_text().strip()
                if text and 2 < len(text) < 30: products.append(text)
        
        # From h2/h3 headings
        for h in soup.find_all(["h2", "h3"], limit=10):
            text = h.get_text().strip()
            if text and 3 < len(text) < 50: products.append(text)

        # 5. Contact Info
        contact_info = {}
        html_str = str(soup)
        email_match = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", html_str)
        phone_match = re.search(r"[\+]?[\d\s\-\(\)]{10,}", html_str)
        if email_match: contact_info["email"] = email_match.group(0)
        if phone_match: contact_info["phone"] = phone_match.group(0).strip()

        # 6. Social Links
        social_links = {}
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "instagram.com" in href: social_links["instagram"] = href
            elif "facebook.com" in href: social_links["facebook"] = href
            elif "linkedin.com" in href: social_links["linkedin"] = href

        return {
            "business_name": business_name,
            "tagline": tagline,
            "about_text": about_text,
            "products_services": list(set(products))[:15],
            "contact_info": contact_info,
            "social_links": social_links
        }

    def _extract_colors(self, html: str) -> List[str]:
        """Extract hex colors from HTML/CSS."""
        hex_pattern = r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b"
        matches = re.findall(hex_pattern, html)
        
        color_counts = {}
        for color in matches:
            c = color.upper()
            if len(c) == 4: # #FFF -> #FFFFFF
                c = "#" + "".join([x*2 for x in c[1:]])
            
            # Filter out black and white
            if c in ["#FFFFFF", "#000000", "#FFF", "#000"]:
                continue
                
            color_counts[c] = color_counts.get(c, 0) + 1

        # Sort by usage and return top 5
        sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
        return [c[0] for c in sorted_colors[:5]]

    def _extract_logo(self, soup: BeautifulSoup) -> Optional[str]:
        """Find logo URL."""
        # og:image
        og_img = soup.find("meta", property="og:image")
        if og_img: return urljoin(self.url, og_img.get("content", ""))

        # img with 'logo'
        for img in soup.find_all("img", src=True):
            src = img["src"].lower()
            alt = img.get("alt", "").lower()
            cls = str(img.get("class", "")).lower()
            if "logo" in src or "logo" in alt or "logo" in cls:
                return urljoin(self.url, img["src"])
        
        return None

    def _detect_brand_tone(self, text: str) -> str:
        """Simple keyword-based tone detection."""
        text = text.lower()
        if any(w in text for w in ["professional", "expert", "trusted", "reliable", "quality"]):
            return "Professional"
        if any(w in text for w in ["fun", "exciting", "amazing", "love", "passion", "playful"]):
            return "Fun and Playful"
        if any(w in text for w in ["inspire", "motivate", "achieve", "success", "growth"]):
            return "Inspiring"
        if any(w in text for w in ["family", "friendly", "warm", "care", "together", "community"]):
            return "Friendly and Warm"
        return "Professional"

    def _detect_business_type(self, text: str) -> str:
        """Simple keyword-based business type detection."""
        text = text.lower()
        if any(w in text for w in ["restaurant", "food", "cafe", "bakery", "kitchen"]):
            return "Food and Restaurant"
        if any(w in text for w in ["fashion", "clothing", "wear", "style", "shop", "boutique"]):
            return "Fashion and Clothing"
        if any(w in text for w in ["clinic", "health", "doctor", "medical", "wellness"]):
            return "Healthcare"
        if any(w in text for w in ["gym", "fitness", "workout", "training", "yoga"]):
            return "Gym and Fitness"
        if any(w in text for w in ["salon", "beauty", "hair", "spa", "cosmetic"]):
            return "Salon and Beauty"
        if any(w in text for w in ["tech", "software", "app", "digital", "platform"]):
            return "Tech and Software"
        return "Retail and Other"
