// Abstraction of Webgl, and event manager
// Controller class could be more abstract

const canvas = document.querySelector("canvas")
const gl = canvas.getContext("webgl2")
if (gl === null) throw "[ERR: can't load opengl]"

const createShader = (source, type) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
    return shader
}

const createProgram = (vertex, fragment) => {
    var program = gl.createProgram()
    gl.attachShader(program, createShader(vertex, gl.VERTEX_SHADER))
    gl.attachShader(program, createShader(fragment, gl.FRAGMENT_SHADER))
    gl.linkProgram(program)
    
    program.createUniform = (type, name) => (...args) => {
    	program.use()
    	gl['uniform' + type](gl.getUniformLocation(program, name), ...args)
    }

    program.use = () => {
    	gl.useProgram(program)
    }
    
    return program
}

const createVBO = (data, program) => {
	const VBO = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, VBO)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)

	let offset = 0
	let len = 0

	VBO.attribute = (name, type, size, num, normalize) => {
		var pos = gl.getAttribLocation(program, name)
		gl.vertexAttribPointer(pos, num, type, !!normalize, size * num, 0)
		gl.enableVertexAttribArray(pos)
		offset += size * num
		len += num
	}

	VBO.render_triangles = () => {
		program.use()
		gl.drawArrays(gl.TRIANGLES, 0, data.length / len)
	}
	return VBO
}

const fullscreen_VBO = program => {
	const VBO = createVBO([
	    3.0, 1.0,
	    -1.0, 1.0,
	    -1.0, -3.0
	], program)
	VBO.attribute("a_pos", gl.FLOAT, 4, 2)
	return VBO
}

const create1dtexture = (width, height, internaltype, type, typelen) => {
	const tex = gl.createTexture();

	tex.length = width * height
	tex.typelen = typelen
	tex.data = new Uint32Array(tex.length);

	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(gl.TEXTURE_2D, 0, internaltype, width, height, 0, type, gl.UNSIGNED_INT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  	tex.update = () => {
  		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, type, gl.UNSIGNED_INT, tex.data);
  	}

  	// tex.setpix = (subdata, i) => {
  	// 	gl.bindTexture(gl.TEXTURE_2D, tex);
	// 	gl.texSubImage2D(gl.TEXTURE_2D, 0, 
	// 		i % width,
	// 		0 | i / width, 
	// 		1, 1, type, gl.UNSIGNED_BYTE, subdata);
  	// }

  	tex.get = i => tex.data[i]

  	tex.set = (data, offset) => {
  		if (data.some(v=>v >= (2**32))) throw "texture block: hit data element size cap"
  		tex.data.set(data, offset)
  	}

	tex.bindtosampler = i => {
		gl.activeTexture(gl.TEXTURE0 + i);
		gl.bindTexture(gl.TEXTURE_2D, tex);
	}

	return tex;
}

const create_texture2d = (image, type) => {
	const tex = gl.createTexture();

	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(gl.TEXTURE_2D, 0, type, type, gl.UNSIGNED_BYTE, image);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	tex.bindtosampler = i => {
		gl.activeTexture(gl.TEXTURE0 + i);
		gl.bindTexture(gl.TEXTURE_2D, tex);
	}

	return tex;
}

const uniform_block = (program, blockname) => {
	let self = {}
	const uboBuffer = gl.createBuffer();
	const blockIndex = gl.getUniformBlockIndex(program, blockname);
	self.length = gl.getActiveUniformBlockParameter(program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE) / 8
	self.typelen = 8
	self.data = new Uint32Array(self.length / 2);
	gl.uniformBlockBinding(program, blockIndex, 0);
	gl.bindBuffer(gl.UNIFORM_BUFFER, uboBuffer);
	gl.bufferData(gl.UNIFORM_BUFFER, self.length * self.typelen, gl.DYNAMIC_DRAW);
	gl.bindBufferRange(gl.UNIFORM_BUFFER, 0, uboBuffer, 0, self.length * self.typelen);

	self.set = (data, offset) => {
		if (data.some(v=>v >= (1<<16))) throw "uniform block: hit data element size cap"
		if (offset%2 == 1) {
			data.unshift(self.get(offset-1))
			offset --;
		}
		if ((offset+data.length)%2 == 1) 
			data.push(self.get(offset+data.length))
		data = data.map((v,i) => (v<<16)+data[i+1]).filter((v,i) => i%2==0)
		if (data.length + offset/2 >= self.data.length) throw "uniform block: hit data size cap"
		self.data.set(data, offset/2)
	}

	self.update = () => {
		gl.bindBuffer(gl.UNIFORM_BUFFER, uboBuffer);
		gl.bufferSubData(gl.UNIFORM_BUFFER, 0, self.data, 0)
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);
	}
	self.get = i => {
		let data = self.data[0|i/2]
		return i%2 == 0 ? data >> 16 : data & 0xFFFF
	}
	return self
}

let resolution = 1;

const resize = setsize => {
	document.body.onresize = () => {
		// const dim = 1
		// const w = Math.min(window.innerWidth, window.innerHeight * dim)
		// const h = w / dim

		w = window.innerWidth;
		h = window.innerHeight;

		canvas.style.width = w + "px"
		canvas.style.height = h + "px"
		canvas.width = w * resolution
		canvas.height = h * resolution

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		setsize(gl.canvas.height / gl.canvas.width)
	}

	document.body.onresize()
}

///////////////////////////

const key_codes = {
	87: "w", 65: "a", 83: "s", 68: "d", 32: "Space", 16: "Shift", 9: "Ctrl",
	38: "up", 40: "down", 37: "left", 39: "right",
	188: ",", 190: ".", 77:"m"
}
const mouse_codes = {
	0: "left", 1: "middle", 2:"right"
}
const Controller = { 
	w: 0, a: 0, s: 0, d: 0, Space: 0, Shift: 0, Ctrl: 0, 
	up: 0, down: 0, left: 0, right: 0, 

	mouse_down: null,

	_keys: {},
	_dmouseX: 0,
	_dmouseY: 0,
}

document.addEventListener("keydown", e => { 
	const key = key_codes[e.keyCode]
	let mouse_key = ["m",",","."].indexOf(key)
	if (mouse_key != -1) Controller.mouse_down = mouse_codes[mouse_key]
	Controller[key_codes[e.keyCode]] = 1; 
	if (key == "Ctrl") e.preventDefault()
})
document.addEventListener("keyup", e => { 
	const key = key_codes[e.keyCode]
	if (["m",",","."].includes(key)) Controller.mouse_down = null
	Controller[key] = 0; 
})

Controller.locked = () => !!document.pointerLockElement

canvas.onmousedown = e => { Controller.mouse_down = mouse_codes[e.button] }
canvas.onmouseup = e => { Controller.mouse_down = null }

canvas.addEventListener("click", async () => { 
	if (!Controller.locked()) await canvas.requestPointerLock()
	else Controller._mouse_clicked = 1 
})

Controller.dmouse = () => {
	const dx = Controller.dmouseX 
	const dy = Controller.dmouseY
	Controller.dmouseX = 0
	Controller.dmouseY = 0
	return [dx, dy]
}

document.body.onmousemove = e => {
	Controller.dmouseX += e.movementX
	Controller.dmouseY += e.movementY
}
