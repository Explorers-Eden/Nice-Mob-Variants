schedule function nice_mob_variants:chicken_jockey/init 9t

execute as @e[type=chicken,tag=!is_jockey] if data entity @s {IsChickenJockey:1b} at @s unless dimension minecraft:the_nether run return run function nice_mob_variants:chicken_jockey/zombie
execute as @e[type=chicken,tag=!is_jockey] if data entity @s {IsChickenJockey:1b} at @s if dimension minecraft:the_nether run return run function nice_mob_variants:chicken_jockey/strider