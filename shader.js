window.onload = function() {
    function createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.margin = '10px';
        return canvas;
    }

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'row';
    container.style.alignItems = 'start';
    container.style.padding = '20px';
    document.body.appendChild(container);

    const canvas1 = createCanvas(520, 443);
    const canvas2 = createCanvas(668, 800);
    container.appendChild(canvas1);
    container.appendChild(canvas2);

    const renderer1 = new THREE.WebGLRenderer({ canvas: canvas1 });
    const renderer2 = new THREE.WebGLRenderer({ canvas: canvas2 });
    renderer1.setSize(520, 443);
    renderer2.setSize(668, 800);

    const scene1 = new THREE.Scene();
    const scene2 = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const loader = new THREE.TextureLoader();
    const textureSet1 = {};
    const textureSet2 = {};

    Promise.all([
        new Promise(resolve => {
            loader.load('src/depth.png', texture => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                textureSet1.depth = texture;
                resolve();
            });
        }),
        new Promise(resolve => {
            loader.load('src/color.png', texture => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                textureSet1.color = texture;
                resolve();
            });
        }),
        new Promise(resolve => {
            loader.load('src/normal.png', texture => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                textureSet1.normal = texture;
                resolve();
            });
        }),
       
        new Promise(resolve => {
            loader.load('src/depth2.png', texture => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                textureSet2.depth = texture;
                resolve();
            });
        }),
        new Promise(resolve => {
            loader.load('src/color2.png', texture => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                textureSet2.color = texture;
                resolve();
            });
        }),
        new Promise(resolve => {
            loader.load('src/normal2.png', texture => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                textureSet2.normal = texture;
                resolve();
            });
        })
    ]).then(() => {
        function createMaterial(initialTextures) {
            return new THREE.ShaderMaterial({
                uniforms: {
                    iChannel0: { value: initialTextures.depth },
                    iChannel1: { value: initialTextures.color },
                    iChannel2: { value: initialTextures.normal },
                    iMouse: { value: new THREE.Vector2(0.5, 0.5) },
                    iResolution: { value: new THREE.Vector2(520, 443) },
                    lightHeight: { value: 1.0 },
                    lightRadius: { value: 1.0 },
                    shadowIntensity: { value: 1.0 },
                    shadowSoftness: { value: 1.0 },
                    shadowBias: { value: 0.001 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D iChannel0;
                    uniform sampler2D iChannel1;
                    uniform sampler2D iChannel2;
                    uniform vec2 iMouse;
                    uniform vec2 iResolution;
                    uniform float lightHeight;
                    uniform float shadowIntensity;
                    uniform float shadowSoftness;
                    uniform float shadowBias;
                    
                    varying vec2 vUv;

                    float sampleShadowMap(vec2 uv, float compareZ, float bias) {
                        if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                            return 1.0;
                        }
                        float depth = texture2D(iChannel0, uv).r;
                        return depth < compareZ - bias ? 0.0 : 1.0;
                    }

                    float gaussian(float x, float sigma) {
                        return exp(-(x * x) / (2.0 * sigma * sigma));
                    }

                    float calculateShadow(vec3 fragPos, vec3 normal, vec3 lightPos) {
                        vec3 lightDir = normalize(lightPos - fragPos);
                        float bias = shadowBias * (1.0 - dot(normal, lightDir));
                        
                        float shadow = 0.0;
                        float totalWeight = 0.0;
                        
                        // Gaussian kernel size and sigma based on shadow softness
                        float kernelSize = shadowSoftness * 0.01;
                        float sigma = 1.0;
                        
                        // Sample points in a disc pattern
                        for(float i = -2.0; i <= 2.0; i += 1.0) {
                            for(float j = -2.0; j <= 2.0; j += 1.0) {
                                vec2 offset = vec2(i, j) * kernelSize;
                                float weight = gaussian(length(offset), sigma);
                                
                                vec3 samplePos = fragPos + vec3(offset, 0.0);
                                float sampleResult = sampleShadowMap(samplePos.xy, samplePos.z, bias);
                                
                                shadow += sampleResult * weight;
                                totalWeight += weight;
                            }
                        }
                        
                        shadow /= totalWeight;
                        return mix(0.1, 1.0, shadow);  // Maintain some ambient light
                    }

                    void main() {
                        vec2 uv = vUv;
                        vec4 baseColor = texture2D(iChannel1, uv);
                        float depth = texture2D(iChannel0, uv).r;
                        vec3 normal = normalize(texture2D(iChannel2, uv).rgb * 2.0 - 1.0);

                        vec2 mouseUV = iMouse / iResolution;
                        vec3 lightPos = vec3(mouseUV.x, mouseUV.y, lightHeight);
                        vec3 fragPos = vec3(uv, depth);

                        vec3 lightDir = normalize(lightPos - fragPos);
                        float diffuse = max(0.0, dot(normal, lightDir));
                        
                        float distanceToLight = length(lightPos - fragPos);
                        float attenuation = 1.0 / (1.0 + 0.1 * distanceToLight + 0.01 * distanceToLight * distanceToLight);
                        
                        float shadow = calculateShadow(fragPos, normal, lightPos);
                        
                        float ambient = 0.1;
                        vec3 lighting = baseColor.rgb * (
                            ambient + 
                            diffuse * attenuation * shadow * shadowIntensity
                        );
                        
                        lighting = lighting / (lighting + vec3(1.0));
                        lighting = pow(lighting, vec3(1.0 / 2.2));

                        gl_FragColor = vec4(lighting, 1.0);
                    }
                `
            });
        }

        const material1 = createMaterial(textureSet1);
        const material2 = createMaterial(textureSet2);
        
        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh1 = new THREE.Mesh(geometry, material1);
        const mesh2 = new THREE.Mesh(geometry, material2);
        
        scene1.add(mesh1);
        scene2.add(mesh2);

        function handleMouseMove(event, canvas, material) {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            material.uniforms.iMouse.value.set(x, canvas.height - y);
            material.uniforms.iResolution.value.set(canvas.width, canvas.height);
        }

        canvas1.addEventListener('mousemove', (event) => handleMouseMove(event, canvas1, material1));
        canvas2.addEventListener('mousemove', (event) => handleMouseMove(event, canvas2, material2));

        const controls = document.createElement('div');
        controls.style.position = 'fixed';
        controls.style.top = '10px';
        controls.style.right = '10px';
        controls.style.backgroundColor = 'rgba(0,0,0,0.5)';
        controls.style.padding = '10px';
        controls.style.color = 'white';
        controls.style.borderRadius = '5px';
        controls.style.fontFamily = 'Arial, sans-serif';

        function createSlider(label, min, max, value, step, onChange) {
            const container = document.createElement('div');
            container.style.marginBottom = '10px';
            
            const labelElement = document.createElement('div');
            labelElement.textContent = label;
            container.appendChild(labelElement);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = min;
            slider.max = max;
            slider.step = step;
            slider.value = value;
            slider.style.width = '200px';
            
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                onChange(value);
            });
            
            container.appendChild(slider);
            return container;
        }

        controls.appendChild(createSlider('Light Height', 1, 10, 1.0, 0.1, (value) => {
            material1.uniforms.lightHeight.value = value;
            material2.uniforms.lightHeight.value = value;
        }));

        controls.appendChild(createSlider('Shadow Intensity', 0, 2, 2.0, 0.1, (value) => {
            material1.uniforms.shadowIntensity.value = value;
            material2.uniforms.shadowIntensity.value = value;
        }));

        controls.appendChild(createSlider('Shadow Softness', 0, 2, 2.0, 0.01, (value) => {
            material1.uniforms.shadowSoftness.value = value;
            material2.uniforms.shadowSoftness.value = value;
        }));

        document.body.appendChild(controls);

        function animate() {
            requestAnimationFrame(animate);
            renderer1.render(scene1, camera);
            renderer2.render(scene2, camera);
        }
        animate();
    });
};