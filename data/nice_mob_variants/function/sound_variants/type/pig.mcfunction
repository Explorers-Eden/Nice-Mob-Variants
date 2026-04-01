tag @s add has_sound

execute if data entity @s {variant:"nice_mob_variants:ender"} run return run data modify entity @s sound_variant set value "nice_mob_variants:ender"
execute if data entity @s {variant:"nice_mob_variants:skeleton"} run return run data modify entity @s sound_variant set value "nice_mob_variants:skeleton"

execute store result score $pig_sound nice_mob_variants.technical run random value 1..4
execute if score $pig_sound nice_mob_variants.technical matches 3..4 run return run data modify entity @s sound_variant set value "minecraft:classic"
execute if score $pig_sound nice_mob_variants.technical matches 2 run return run data modify entity @s sound_variant set value "minecraft:big"
execute if score $pig_sound nice_mob_variants.technical matches 1 run return run data modify entity @s sound_variant set value "minecraft:mini"