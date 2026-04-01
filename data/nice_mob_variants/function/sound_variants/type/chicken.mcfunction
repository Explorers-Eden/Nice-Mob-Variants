tag @s add has_sound

execute if data entity @s {variant:"nice_mob_variants:duck"} run return run data modify entity @s sound_variant set value "nice_mob_variants:duck"
execute if data entity @s {variant:"nice_mob_variants:ender"} run return run data modify entity @s sound_variant set value "nice_mob_variants:ender"
execute if data entity @s {variant:"nice_mob_variants:ostrich"} run return run data modify entity @s sound_variant set value "nice_mob_variants:ostrich"
execute if data entity @s {variant:"nice_mob_variants:pigeon"} run return run data modify entity @s sound_variant set value "nice_mob_variants:pigeon"
execute if data entity @s {variant:"nice_mob_variants:rooster"} run return run data modify entity @s sound_variant set value "nice_mob_variants:rooster"
execute if data entity @s {variant:"nice_mob_variants:skeleton"} run return run data modify entity @s sound_variant set value "nice_mob_variants:skeleton"
execute if data entity @s {variant:"nice_mob_variants:strider"} run return run data modify entity @s sound_variant set value "nice_mob_variants:strider"
execute if data entity @s {variant:"nice_mob_variants:goose"} run return run data modify entity @s sound_variant set value "nice_mob_variants:goose"

execute store result score $chicken_sound nice_mob_variants.technical run random value 1..3
execute unless score $chicken_sound nice_mob_variants.technical matches 3 run return run data modify entity @s sound_variant set value "minecraft:classic"
execute if score $chicken_sound nice_mob_variants.technical matches 3 run return run data modify entity @s sound_variant set value "minecraft:picky"