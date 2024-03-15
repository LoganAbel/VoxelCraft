const main = async () => {
	const block_size = 256

	let program = createProgram(vertex_shader, fragment_shader)
	const cam = new Camera(glm.vec(.5-.5/block_size, .5+4.5/block_size, .5-.5/block_size), program.createUniform('Matrix4fv', 'u_cam'), 1/block_size)
	resize(program.createUniform('1f', 'u_dim'))
	const VBO = fullscreen_VBO(program)

	const tex_sheet = create_texture2d(document.getElementById("tex_sheet"), gl.RGB)
	program.createUniform('1i', 'u_tex')(1)

	let octree = new Octree(create1dtexture(1024, 1024, gl.R32UI, gl.RED_INTEGER, 2))
	octree.data.set([1,2,3,4,5,6,7,8].map(Octree.encode_color),0)
	program.createUniform('1i', 'u_data')(0)

	let chunkmanager = new ChunkManager(cam, octree, scene1, 3, 5);

	let t = performance.now()
	console.log("generating voxels...")
	scene1(glm.vec(0,0,0),glm.vec(block_size, block_size, block_size), data => {
		octree.generate(0, new Volume(data, glm.vec(block_size, block_size, block_size)))
		octree.data.update()
		chunkmanager.generate()
		console.log(`generated in ${performance.now()-t} ms`)
	})

	let place_type = 5;

	let dts = new Array(60).fill(60)
	let time

	const update = () => {
		let dt = performance.now() - time
		dts.push(dt)
		dts.shift()
		document.getElementById("fps").innerHTML 
			= Math.round(1000/dts.reduce((a,b)=>a+b)*dts.length) + " fps"

		time = performance.now()

		const format = Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 }).format
		const [storage_cur, storage_max] = octree.storage_stat()
		document.getElementById("storage").innerHTML = format(storage_cur) + " / " + format(storage_max) + " KB"

		if (Controller.locked() && Controller.mouse_down != null) {
			const ray = cam.center_ray()
			const res = octree.trace(ray, Math.log2(block_size), 6/block_size, block => block != 1 && block != 4)
			if (res != null) {
				if (Controller.mouse_down == "left")
					octree.setp(Octree.encode_color(0), res.pos, Math.log2(block_size))
				if (Controller.mouse_down == "middle")
					place_type = octree.getp(res.pos)
				const new_block_pos = glm.add(res.pos, glm.mul(res.norm, 1/block_size))
				if (Controller.mouse_down == "right" && !cam.hitbox.intersect(new_block_pos, glm.add(new_block_pos, 1/block_size)))
					octree.setp(Octree.encode_color(place_type), new_block_pos, Math.log2(block_size))
				octree.data.update()
			}
			Controller.mouse_down = null
		}
		chunkmanager.update()
		cam.controll(Controller, octree, dt, 1/block_size)
		octree.data.bindtosampler(0)
		tex_sheet.bindtosampler(1)
	    VBO.render_triangles()

		requestAnimationFrame(update)
	}

	update()
}

main()