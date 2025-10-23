execute if data entity @s {variant:"nice_mob_variants:skeleton"} run data modify entity @s DeathLootTable set value "minecraft:entities/skeleton_horse"
execute if data entity @s {variant:"nice_mob_variants:ender"} run data modify entity @s DeathLootTable set value "minecraft:entities/enderman"

execute as @s[type=chicken] if data entity @s {variant:"nice_mob_variants:strider"} run data modify entity @s DeathLootTable set value "minecraft:entities/strider"
execute as @s[type=chicken] if data entity @s {variant:"nice_mob_variants:zombie"} run data modify entity @s DeathLootTable set value "minecraft:entities/zombie"
execute as @s[type=chicken] if data entity @s {variant:"nice_mob_variants:duck"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/duck"

execute as @s[type=cow] if data entity @s {variant:"nice_mob_variants:yellow_moobloom"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/yellow_moobloom"
execute as @s[type=cow] if data entity @s {variant:"nice_mob_variants:pink_moobloom"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/pink_moobloom"

execute as @s[type=pig] if data entity @s {variant:"nice_mob_variants:muddy_cold"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/muddy_pig"
execute as @s[type=pig] if data entity @s {variant:"nice_mob_variants:muddy_creamy"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/muddy_pig"
execute as @s[type=pig] if data entity @s {variant:"nice_mob_variants:muddy_dark"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/muddy_pig"
execute as @s[type=pig] if data entity @s {variant:"nice_mob_variants:muddy_pale"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/muddy_pig"
execute as @s[type=pig] if data entity @s {variant:"nice_mob_variants:muddy_temperate"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/muddy_pig"
execute as @s[type=pig] if data entity @s {variant:"nice_mob_variants:muddy_warm"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/muddy_pig"
execute as @s[type=pig] if data entity @s {variant:"nice_mob_variants:muddy_wild"} run data modify entity @s DeathLootTable set value "nice_mob_variants:entity/muddy_pig"

tag @s add nice_mob_variants.modified_loot_table
