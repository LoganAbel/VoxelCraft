const cash = seed => (x, y) => {   
   let h = seed + x*374761393 + y*668265263;
   h = (h^(h >> 13))*1274126177;
   return h^(h >> 16);
}

const perlin = rand => (x,y) => {
   let x0 = Math.floor(x);
   let y0 = Math.floor(y);
   let mx = x - x0
   let my = y - y0
   let sx = mx*mx*(3-2*mx);
   let sy = my*my*(3-2*my);
   let res = 0
   for (let dy = 0; dy <= 1; dy ++)
      for (let dx = 0; dx <= 1; dx ++) {
         const n = rand[[x0 + dx, y0 + dy]]
         res += (Math.cos(n) * (dx - mx) + Math.sin(n) * (dy - my))
            * Math.abs(1 - dx - sx) * Math.abs(1 - dy - sy)
      }
   return res
}

const rand1 = cash(Math.random() * 0xFFFF)
const rand2 = cash(Math.random() * 0xFFFF)

onmessage = (e) => {
   let [pos, dim, id] = e.data
   pos = {x:pos.data[0],y:pos.data[1],z:pos.data[2]}
   dim = {x:dim.data[0],y:dim.data[1],z:dim.data[2]}
   let data = new Uint16Array(dim.x * dim.y * dim.z)

   let perlin_small = {}
   for(let x = Math.floor(pos.x/16); x <= Math.ceil((pos.x+dim.x)/16); x++)
      for(let z = Math.floor(pos.z/16); z <= Math.ceil((pos.z+dim.z)/16); z++)
         perlin_small[[x,z]] = rand1(x+0x8000,z+0x8000)
   perlin_small = perlin(perlin_small)

   let perlin_large = {}
   for(let x = Math.floor(pos.x/128); x <= Math.ceil((pos.x+dim.x)/128); x++)
      for(let z = Math.floor(pos.z/128); z <= Math.ceil((pos.z+dim.z)/128); z++)
         perlin_large[[x,z]] = rand2(x+0x8000,z+0x8000)
   perlin_large = perlin(perlin_large)

   const size = 256
   const water_level = size / 2 - 1
   for(let x = 0; x < dim.x; x++)
      for(let z = 0; z < dim.z; z++) {
         let height = 0 | 
            perlin_small((pos.x+x)/16, (pos.z+z)/16) * 8 
            + perlin_large((pos.x+x)/128, (pos.z+z)/128) * 16
            + size / 2
         for(let y = 0; y < dim.y; y++) {
            let py = pos.y+y
            data[x * dim.y * dim.z + y * dim.z + z] = 
               py < height-3 ? 5 :
               py < height-1 ? 3 : 
               py < height ? 2 : 
               py == water_level ? 4 : 
               py < water_level ? 1 
               : 0
         }
      }

   postMessage([data.buffer, id], [data.buffer])
}