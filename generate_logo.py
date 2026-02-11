from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import math

def draw_isometric_cube(size=512):
    # Create distinct layers for glow and main lines
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    center_x, center_y = size // 2, size // 2
    cube_size = size * 0.25
    
    # Vertices of the cube
    # Top face
    t1 = (center_x, center_y - cube_size)
    t2 = (center_x + cube_size * 0.866, center_y - cube_size * 0.5)
    t3 = (center_x, center_y)
    t4 = (center_x - cube_size * 0.866, center_y - cube_size * 0.5)
    
    # Bottom vertices
    b2 = (center_x + cube_size * 0.866, center_y + cube_size * 0.5)
    b3 = (center_x, center_y + cube_size)
    b4 = (center_x - cube_size * 0.866, center_y + cube_size * 0.5)
    
    cyan = (0, 212, 255)
    purple = (123, 97, 255)
    
    # Helper to draw glowing line
    def draw_glow_line(p1, p2, color, width=4):
        # Draw wide faint glow
        draw.line([p1, p2], fill=color + (50,), width=width*4)
        # Draw medium glow
        draw.line([p1, p2], fill=color + (100,), width=width*2)
        # Draw solid core
        draw.line([p1, p2], fill=color + (255,), width=width)

    # Top Face (Cyan)
    draw_glow_line(t1, t2, cyan)
    draw_glow_line(t2, t3, cyan)
    draw_glow_line(t3, t4, cyan)
    draw_glow_line(t4, t1, cyan)
    
    # Right Face (Purple)
    draw_glow_line(t2, b2, purple)
    draw_glow_line(b2, b3, purple)
    draw_glow_line(b3, t3, purple)
    
    # Left Face (Mix/Cyan)
    draw_glow_line(t4, b4, cyan)
    draw_glow_line(b4, b3, cyan)
    # t3-b3 shared is already drawn
    
    # Fill faces with low opacity
    # Top
    top_poly = [t1, t2, t3, t4]
    ImageDraw.Draw(img, 'RGBA').polygon(top_poly, fill=cyan + (30,))
    
    # Right
    right_poly = [t2, b2, b3, t3]
    ImageDraw.Draw(img, 'RGBA').polygon(right_poly, fill=purple + (40,))
    
    # Left
    left_poly = [t4, b4, b3, t3]
    ImageDraw.Draw(img, 'RGBA').polygon(left_poly, fill=cyan + (20,))
    
    return img

if __name__ == "__main__":
    logo = draw_isometric_cube(512)
    logo.save("public/logo.png", "PNG")
    print("Logo generated at public/logo.png")
