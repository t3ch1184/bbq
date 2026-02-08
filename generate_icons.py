# generate_icons.py - Generate placeholder icons for the PWA
# Run this to create icon-192.png and icon-512.png

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    """Create a simple BBQ icon"""
    # Create image with gradient background
    img = Image.new('RGB', (size, size), color='#ff6b35')
    draw = ImageDraw.Draw(img)
    
    # Draw circular background
    draw.ellipse([size//10, size//10, size*9//10, size*9//10], 
                 fill='#ff6b35', outline='#e85a2a', width=size//20)
    
    # Draw flame emoji or text
    try:
        # Try to use a system font
        font_size = size // 2
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        # Fallback to default font
        font = ImageFont.load_default()
    
    # Draw "BBQ" text
    text = "🔥"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - size // 10
    
    draw.text((x, y), text, font=font, fill='white')
    
    # Add "BBQ" text at bottom
    try:
        small_font = ImageFont.truetype("arial.ttf", size // 8)
    except:
        small_font = font
    
    bbq_text = "BBQ"
    bbox = draw.textbbox((0, 0), bbq_text, font=small_font)
    text_width = bbox[2] - bbox[0]
    x = (size - text_width) // 2
    y = size * 3 // 4
    
    draw.text((x, y), bbq_text, font=small_font, fill='white')
    
    # Save
    img.save(filename, 'PNG')
    print(f"✅ Created {filename}")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    print("Generating PWA icons...")
    create_icon(192, os.path.join(script_dir, 'icon-192.png'))
    create_icon(512, os.path.join(script_dir, 'icon-512.png'))
    print("\n✅ Icons generated successfully!")
    print("Note: These are placeholder icons. You can replace them with custom icons later.")
